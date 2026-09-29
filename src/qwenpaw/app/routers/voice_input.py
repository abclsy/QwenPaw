# -*- coding: utf-8 -*-
"""Voice message transcription API for the chat input microphone.

The chat library's built-in speech button relies on the browser
SpeechRecognition API, which is unavailable in WebView2 / WKWebView —
so the desktop app ships its own microphone button: record in the
renderer, upload the audio blob, transcribe server-side (local
whisper or the configured cloud provider), and insert the text into
the input box.
"""
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from ...agents.utils.audio_transcription import transcribe_audio

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice-input"])

# Guard against absurd uploads (a minute of speech is well under 20MB)
_MAX_AUDIO_BYTES = 20 * 1024 * 1024


@router.post("/console/voice/transcribe")
async def transcribe_voice_message(
    audio: UploadFile = File(..., description="Recorded audio blob"),
) -> dict:
    """Transcribe a short voice recording to text for the input box."""
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty audio file")
    if len(data) > _MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail="audio file too large (max 20MB)",
        )

    suffix = Path(audio.filename or "record.webm").suffix or ".webm"
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            suffix=suffix,
            prefix="voice_input_",
            delete=False,
        ) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)

        text = await transcribe_audio(str(tmp_path))
        if text is None:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Transcription unavailable — check the voice "
                    "transcription settings (local whisper or a cloud "
                    "provider)."
                ),
            )
        return {"text": text.strip()}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Voice transcription failed")
        raise HTTPException(
            status_code=500,
            detail=f"transcription failed: {e}",
        ) from e
    finally:
        if tmp_path is not None:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                logger.debug("Failed to delete temp audio %s", tmp_path)
