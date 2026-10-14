# -*- coding: utf-8 -*-
"""
LoL 对局实验室 (LoL Match Lab) - Windows 桌面原生客户端
基于 Windows 原生 WebView2 引擎构建的独立桌面客户端，免打开外部浏览器，支持一键运行。
"""
import atexit
import ctypes
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser


def enable_dpi():
    """启用 Windows 高 DPI 感知，防止高分屏下界面发虚"""
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


enable_dpi()

# 确定资源与运行路径
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS
    EXE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    EXE_DIR = BUNDLE_DIR

# 确定数据持久化目录 (优先放在 EXE 同级的 data 文件夹中，实现 100% 绿色便携)
candidate_data = os.path.join(EXE_DIR, 'data')
try:
    os.makedirs(candidate_data, exist_ok=True)
    test_file = os.path.join(candidate_data, '.write_test')
    with open(test_file, 'w') as f:
        f.write('ok')
    os.remove(test_file)
    DATA_DIR = candidate_data
except Exception:
    DATA_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'LoLMatchLab', 'data')
    os.makedirs(DATA_DIR, exist_ok=True)


def init_data_dir():
    """初始化数据目录，确保有默认配置和离线静态数据"""
    settings_file = os.path.join(DATA_DIR, 'settings.json')
    if not os.path.isfile(settings_file):
        bundled_example = os.path.join(BUNDLE_DIR, 'data', 'settings.example.json')
        bundled_settings = os.path.join(BUNDLE_DIR, 'data', 'settings.json')
        if os.path.isfile(bundled_example):
            shutil.copy(bundled_example, settings_file)
        elif os.path.isfile(bundled_settings):
            shutil.copy(bundled_settings, settings_file)

    bundled_static = os.path.join(BUNDLE_DIR, 'data', 'static')
    target_static = os.path.join(DATA_DIR, 'static')
    if os.path.isdir(bundled_static) and not os.path.isdir(target_static):
        try:
            shutil.copytree(bundled_static, target_static)
        except Exception:
            pass


def check_port_alive(port=5179):
    """检测当前端口服务是否已响应"""
    try:
        req = urllib.request.Request(f'http://127.0.0.1:{port}/api/status', headers={'User-Agent': 'LoLLauncher'})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            if resp.status == 200:
                return True
    except Exception:
        pass
    return False


class NodeServerManager:
    """Node.js 后台服务生命周期管理"""
    def __init__(self, port=5179):
        self.port = port
        self.process = None
        self.log_file = os.path.join(DATA_DIR, 'server.log')
        self._find_binaries()

    def _find_binaries(self):
        bundled_node = os.path.join(BUNDLE_DIR, 'node.exe')
        if os.path.isfile(bundled_node):
            self.node_bin = bundled_node
        else:
            self.node_bin = shutil.which('node') or 'node'
        self.server_js = os.path.join(BUNDLE_DIR, 'server', 'index.js')
        self.public_dir = os.path.join(BUNDLE_DIR, 'public')

    def start(self):
        if self.is_running():
            return True
        init_data_dir()
        env = os.environ.copy()
        env['PORT'] = str(self.port)
        env['LOLLAB_DATA'] = DATA_DIR
        env['LOLLAB_PUBLIC'] = self.public_dir

        flags = 0
        if sys.platform == 'win32':
            flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)

        log_f = open(self.log_file, 'a', encoding='utf-8')
        try:
            self.process = subprocess.Popen(
                [self.node_bin, self.server_js],
                cwd=BUNDLE_DIR,
                env=env,
                stdout=log_f,
                stderr=subprocess.STDOUT,
                creationflags=flags
            )
            return True
        except Exception as e:
            print(f'启动 Node 核心服务失败: {e}', file=sys.stderr)
            return False

    def is_running(self):
        return self.process is not None and self.process.poll() is None

    def stop(self):
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=2.0)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None


class DesktopClientAPI:
    """暴露给前端客户端的原生 JS 调用接口"""
    def open_data_dir(self):
        if sys.platform == 'win32':
            os.startfile(DATA_DIR)
        return True

    def get_client_info(self):
        return {
            'data_dir': DATA_DIR,
            'exe_dir': EXE_DIR,
            'version': '0.1.0',
            'is_native_client': True
        }


def run_desktop_client(url, port, manager):
    """启动 WebView2 原生桌面客户端主窗口"""
    import webview

    ico_path = os.path.join(BUNDLE_DIR, 'app.ico')
    cache_dir = os.path.join(DATA_DIR, 'client_cache')
    os.makedirs(cache_dir, exist_ok=True)

    api = DesktopClientAPI()
    window = webview.create_window(
        title='LoL 对局实验室 (LoL Match Lab)',
        url=url,
        width=1340,
        height=880,
        min_size=(1080, 700),
        background_color='#080e18',
        text_select=True,
        js_api=api
    )

    try:
        # 使用 Windows 原生 Edge WebView2 引擎
        webview.start(
            storage_path=cache_dir,
            icon=ico_path if os.path.isfile(ico_path) else None,
            private_mode=False
        )
    finally:
        manager.stop()


def main():
    port = 5179
    url = f'http://127.0.0.1:{port}'

    manager = NodeServerManager(port=port)
    atexit.register(manager.stop)

    # 启动后台服务 (如果未启动)
    if not check_port_alive(port):
        if not manager.start():
            print('后台服务启动失败，请检查日志。', file=sys.stderr)
            sys.exit(1)

        # 等待服务就绪 (最多等待 8 秒)
        for _ in range(40):
            if check_port_alive(port):
                break
            time.sleep(0.2)

    # 支持传统命令行模式 --browser / --headless
    if '--browser' in sys.argv:
        print(f'LoL Match Lab 正在浏览器模式运行: {url}')
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            manager.stop()
            sys.exit(0)

    if '--headless' in sys.argv or '--no-gui' in sys.argv:
        print(f'LoL Match Lab 正在后台无界面模式运行: {url}')
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            manager.stop()
            sys.exit(0)

    # 默认模式：启动原生桌面客户端窗口 (无需打开浏览器)
    try:
        run_desktop_client(url, port, manager)
    except Exception as e:
        # 极低概率环境兜底：若系统不支持 WebView2，降级使用外部浏览器
        print(f'初始化原生客户端窗口失败 ({e})，降级调出默认浏览器...', file=sys.stderr)
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            manager.stop()
            sys.exit(0)


if __name__ == '__main__':
    main()
