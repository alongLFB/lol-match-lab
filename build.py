# -*- coding: utf-8 -*-
"""
一键打包脚本: 生成高清图标 -> PyInstaller 单文件 EXE -> 发布目录与 ZIP 压缩包
用法: python build.py
"""
import os
import shutil
import subprocess
import sys
import zipfile

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = 'LoL对局实验室'
os.chdir(HERE)


def make_icon(path):
    """生成具备英雄联盟 Hextech / 电竞战报风格的高清多尺寸图标"""
    S = 512
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 背景渐变圆角矩形
    bg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    for y in range(S):
        t = y / S
        r = int(7 + 10 * t)
        g = int(16 + 22 * t)
        b = int(32 + 40 * t)
        bg_draw.line([(0, y), (S, y)], fill=(r, g, b, 255))

    mask = Image.new('L', (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([16, 16, S - 16, S - 16], radius=110, fill=255)
    img.paste(bg, (0, 0), mask)

    # 外层金色与科技蓝双边框
    gold = (200, 170, 110, 255)
    gold_light = (245, 235, 215, 255)
    cyan = (0, 210, 180, 255)
    cyan_glow = (0, 245, 255, 255)

    d.rounded_rectangle([16, 16, S - 16, S - 16], radius=110, outline=gold, width=16)
    d.rounded_rectangle([32, 32, S - 32, S - 32], radius=94, outline=(25, 55, 85, 200), width=6)

    center_x, center_y = S // 2, S // 2

    # 核心 Hextech 菱形徽章
    poly = [
        (center_x, center_y - 140),
        (center_x + 120, center_y),
        (center_x, center_y + 140),
        (center_x - 120, center_y)
    ]
    d.polygon(poly, fill=(15, 32, 55, 230), outline=cyan, width=10)

    # 内部发光能量核
    poly_inner = [
        (center_x, center_y - 75),
        (center_x + 60, center_y),
        (center_x, center_y + 75),
        (center_x - 60, center_y)
    ]
    d.polygon(poly_inner, fill=cyan_glow, outline=gold_light, width=6)

    # 交叉战刃徽记
    d.line([(center_x - 85, center_y - 65), (center_x + 85, center_y + 65)], fill=gold_light, width=12)
    d.line([(center_x + 85, center_y - 65), (center_x - 85, center_y + 65)], fill=gold_light, width=12)

    # 核心发光星徽
    d.ellipse([center_x - 18, center_y - 18, center_x + 18, center_y + 18], fill=gold_light, outline=(255, 255, 255, 255), width=4)

    img.save(path, format='ICO', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print(f'已生成高清多尺寸图标: {path}')


def find_node_executable():
    """查找本机 Node.js 可执行文件"""
    node = shutil.which('node')
    if node and os.path.isfile(node):
        return os.path.abspath(node)

    # 常见 Windows 安装路径兜底
    candidates = [
        os.path.expandvars(r'%ProgramFiles%\nodejs\node.exe'),
        os.path.expandvars(r'%ProgramFiles(x86)%\nodejs\node.exe'),
        os.path.expandvars(r'%LOCALAPPDATA%\Programs\node\node.exe'),
        os.path.expandvars(r'%USERPROFILE%\scoop\apps\nodejs\current\node.exe'),
        os.path.expandvars(r'%USERPROFILE%\scoop\apps\nvm\current\nodejs\nodejs\node.exe'),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c

    raise FileNotFoundError('未能找到 node.exe，请确保已安装 Node.js 并将其加入环境变量 PATH。')


def main():
    print('=== 开始构建 LoL 对局实验室 Windows 发布包 ===')
    ico = os.path.join(HERE, 'app.ico')
    make_icon(ico)

    node_bin = find_node_executable()
    print(f'使用 Node.js 运行时: {node_bin}')

    # 清理旧的构建产物
    for d in ('build', 'dist'):
        shutil.rmtree(os.path.join(HERE, d), ignore_errors=True)

    # 组装 PyInstaller 打包指令
    add_binary_arg = f'{node_bin};.'
    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--noconfirm',
        '--clean',
        '--onefile',
        '--windowed',
        '--name', NAME,
        '--icon', ico,
        '--collect-all', 'webview',
        '--collect-all', 'clr_loader',
        '--collect-all', 'pythonnet',
        '--add-binary', add_binary_arg,
        '--add-data', 'server;server',
        '--add-data', 'public;public',
        '--add-data', 'data/settings.example.json;data',
        '--add-data', 'data/static;data/static',
        'launcher.py'
    ]

    print('\n执行打包命令中，请稍候...')
    subprocess.check_call(cmd)

    # 组织发布目录 dist/LoL对局实验室/
    pkg = os.path.join(HERE, 'dist', NAME)
    os.makedirs(pkg, exist_ok=True)

    target_exe = os.path.join(pkg, f'{NAME}.exe')
    shutil.move(os.path.join(HERE, 'dist', f'{NAME}.exe'), target_exe)

    readme_txt = os.path.join(HERE, 'README.txt')
    if os.path.isfile(readme_txt):
        shutil.copy(readme_txt, os.path.join(pkg, '使用说明.txt'))

    # 生成发布 ZIP 压缩包
    zp = os.path.join(HERE, 'dist', f'{NAME}.zip')
    print('\n正在打包生成 ZIP 压缩包...')
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(pkg):
            for f in files:
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, os.path.join(HERE, 'dist'))
                z.write(full_path, rel_path)

    exe_size_mb = os.path.getsize(target_exe) / (1024 * 1024)
    zip_size_mb = os.path.getsize(zp) / (1024 * 1024)

    print('\n' + '=' * 50)
    print('🎉 构建成功！发布产物位于 dist 目录：')
    print(f'1. 便携免安装主程序: {target_exe} ({exe_size_mb:.1f} MB)')
    print(f'2. 完整发布目录    : {pkg}')
    print(f'3. 发送给好友压缩包: {zp} ({zip_size_mb:.1f} MB)')
    print('=' * 50)


if __name__ == '__main__':
    main()
