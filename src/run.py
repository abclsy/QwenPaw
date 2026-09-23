# run.py
import sys
from qwenpaw.main import main

# 解决 Mac 打包路径问题
sys.setrecursionlimit(100000)

if __name__ == "__main__":
    main()