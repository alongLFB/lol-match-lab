# -*- coding: utf-8 -*-
"""
LoL 对局实验室 (LoL Match Lab) - Windows 桌面启动管理器
负责管理内置 Node.js 服务进程、实时监测 LCU 连接状态、提供一键访问与数据目录管理界面。
"""
import atexit
import ctypes
from ctypes import wintypes
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
import tkinter as tk
from tkinter import ttk, messagebox


def enable_dpi():
    """启用 Windows 高 DPI 感知，防止高分屏下界面发虚"""
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


# 路径确定
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS
    EXE_DIR = os.path.dirname(os.path.abspath(sys.executable))
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    EXE_DIR = BUNDLE_DIR

# 确定持久化数据保存目录 (优先保存在 EXE 同级的 data 目录，实现 100% 绿色便携)
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
        else:
            with open(settings_file, 'w', encoding='utf-8') as f:
                json.dump({
                    "openai": {
                        "baseUrl": "https://api.openai.com/v1",
                        "apiKey": "",
                        "model": "gpt-4o-mini",
                        "temperature": 0.4,
                        "extraPrompt": ""
                    },
                    "lcu": { "installDir": "", "port": "", "token": "" }
                }, f, indent=2, ensure_ascii=False)

    # 拷贝离线静态数据（英雄、装备、召唤师技能等）
    bundled_static = os.path.join(BUNDLE_DIR, 'data', 'static')
    target_static = os.path.join(DATA_DIR, 'static')
    if os.path.isdir(bundled_static) and not os.path.isdir(target_static):
        try:
            shutil.copytree(bundled_static, target_static)
        except Exception:
            pass


def check_port_alive(port=5179):
    """检测当前端口是否已有服务运行"""
    try:
        req = urllib.request.Request(f'http://127.0.0.1:{port}/api/status', headers={'User-Agent': 'LoLLauncher'})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            if resp.status == 200:
                return True
    except Exception:
        pass
    return False


def get_lcu_status(port=5179):
    """获取当前后端连接状态"""
    try:
        req = urllib.request.Request(f'http://127.0.0.1:{port}/api/status', headers={'User-Agent': 'LoLLauncher'})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8'))
                return data
    except Exception:
        pass
    return None


class NodeServerManager:
    """Node.js 服务生命周期管理器"""
    def __init__(self, port=5179):
        self.port = port
        self.process = None
        self.log_file = os.path.join(DATA_DIR, 'server.log')
        self._find_binaries()

    def _find_binaries(self):
        # 优先使用内置打包的 node.exe
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
            print(f'启动 Node 服务失败: {e}', file=sys.stderr)
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

    def restart(self):
        self.stop()
        time.sleep(0.5)
        return self.start()


class AppUI:
    """桌面控制台 UI"""
    def __init__(self, root, manager):
        self.root = root
        self.manager = manager
        self.port = manager.port
        self.app_url = f'http://127.0.0.1:{self.port}'
        self.has_auto_opened = False
        self.running = True

        self._setup_window()
        self._build_widgets()
        self._start_server_and_poll()

    def _setup_window(self):
        self.root.title('LoL 对局实验室 (LoL Match Lab)')
        self.root.geometry('520x400')
        self.root.resizable(False, False)
        self.root.configure(bg='#080e18')

        # 居中显示
        self.root.update_idletasks()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - 520) // 2
        y = (sh - 400) // 2
        self.root.geometry(f'520x400+{x}+{y}')

        # 尝试设置图标
        ico_path = os.path.join(BUNDLE_DIR, 'app.ico')
        if os.path.isfile(ico_path):
            try:
                self.root.iconbitmap(ico_path)
            except Exception:
                pass

        self.root.protocol('WM_DELETE_WINDOW', self.on_close)

    def _build_widgets(self):
        # 顶部标题栏区域
        top_frame = tk.Frame(self.root, bg='#0c1626', height=95)
        top_frame.pack(fill='x', side='top')
        top_frame.pack_propagate(False)

        title_label = tk.Label(
            top_frame,
            text='LoL Match Lab 🎮',
            font=('Segoe UI', 17, 'bold'),
            fg='#f0e6d2',
            bg='#0c1626'
        )
        title_label.pack(anchor='w', padx=24, pady=(16, 2))

        sub_label = tk.Label(
            top_frame,
            text='英雄联盟对局实验室 · 实时观战流 · 智能分路识别 · AI 战报复盘',
            font=('Microsoft YaHei UI', 9),
            fg='#c8aa6e',
            bg='#0c1626'
        )
        sub_label.pack(anchor='w', padx=24)

        # 中部卡片区域 (状态展示)
        body_frame = tk.Frame(self.root, bg='#080e18')
        body_frame.pack(fill='both', expand=True, padx=20, pady=16)

        card = tk.Frame(body_frame, bg='#0f1c2e', bd=1, relief='solid', highlightthickness=1, highlightbackground='#1d3350')
        card.pack(fill='both', expand=True, pady=(0, 14))

        # 服务状态行
        row1 = tk.Frame(card, bg='#0f1c2e')
        row1.pack(fill='x', padx=18, pady=(14, 8))
        tk.Label(row1, text='服务地址：', font=('Microsoft YaHei UI', 9, 'bold'), fg='#8fa3bf', bg='#0f1c2e').pack(side='left')
        self.url_label = tk.Label(row1, text=f'{self.app_url}', font=('Consolas', 10, 'bold'), fg='#00d2b4', bg='#0f1c2e', cursor='hand2')
        self.url_label.pack(side='left')
        self.url_label.bind('<Button-1>', lambda e: self.open_browser())

        self.server_badge = tk.Label(row1, text='🟡 正在启动...', font=('Microsoft YaHei UI', 9), fg='#f0e6d2', bg='#23395d', padx=8, pady=2)
        self.server_badge.pack(side='right')

        # 游戏客户端连接状态行
        row2 = tk.Frame(card, bg='#0f1c2e')
        row2.pack(fill='x', padx=18, pady=6)
        tk.Label(row2, text='客户端直连：', font=('Microsoft YaHei UI', 9, 'bold'), fg='#8fa3bf', bg='#0f1c2e').pack(side='left')
        self.lcu_label = tk.Label(row2, text='正在自动探测英雄联盟客户端...', font=('Microsoft YaHei UI', 9), fg='#f0e6d2', bg='#0f1c2e')
        self.lcu_label.pack(side='left')

        # 本地数据目录
        row3 = tk.Frame(card, bg='#0f1c2e')
        row3.pack(fill='x', padx=18, pady=6)
        tk.Label(row3, text='数据存储：', font=('Microsoft YaHei UI', 9, 'bold'), fg='#8fa3bf', bg='#0f1c2e').pack(side='left')
        short_data_dir = DATA_DIR if len(DATA_DIR) <= 38 else '...' + DATA_DIR[-35:]
        self.data_label = tk.Label(row3, text=short_data_dir, font=('Microsoft YaHei UI', 9), fg='#a0b2c6', bg='#0f1c2e')
        self.data_label.pack(side='left')

        # 提示栏
        row4 = tk.Frame(card, bg='#0f1c2e')
        row4.pack(fill='x', padx=18, pady=(8, 12))
        self.tip_label = tk.Label(
            row4,
            text='💡 提示：保持本控制台运行即可；退出直接关闭本窗口。',
            font=('Microsoft YaHei UI', 8),
            fg='#627d98',
            bg='#0f1c2e'
        )
        self.tip_label.pack(side='left')

        # 底部操作按钮区域
        btn_frame = tk.Frame(body_frame, bg='#080e18')
        btn_frame.pack(fill='x')

        self.btn_open = tk.Button(
            btn_frame,
            text='🚀 在浏览器中打开',
            font=('Microsoft YaHei UI', 10, 'bold'),
            fg='#03121f',
            bg='#00d2b4',
            activebackground='#33ebd0',
            activeforeground='#03121f',
            relief='flat',
            cursor='hand2',
            padx=14,
            pady=6,
            command=self.open_browser
        )
        self.btn_open.pack(side='left', padx=(0, 10))

        self.btn_folder = tk.Button(
            btn_frame,
            text='📂 打开数据目录',
            font=('Microsoft YaHei UI', 9),
            fg='#f0e6d2',
            bg='#18283f',
            activebackground='#273c5a',
            activeforeground='#ffffff',
            relief='flat',
            cursor='hand2',
            padx=12,
            pady=6,
            command=self.open_data_folder
        )
        self.btn_folder.pack(side='left', padx=(0, 10))

        self.btn_restart = tk.Button(
            btn_frame,
            text='🔄 重启服务',
            font=('Microsoft YaHei UI', 9),
            fg='#f0e6d2',
            bg='#18283f',
            activebackground='#273c5a',
            activeforeground='#ffffff',
            relief='flat',
            cursor='hand2',
            padx=12,
            pady=6,
            command=self.restart_service
        )
        self.btn_restart.pack(side='left', padx=(0, 10))

        self.btn_exit = tk.Button(
            btn_frame,
            text='⏹️ 退出',
            font=('Microsoft YaHei UI', 9),
            fg='#e26d6d',
            bg='#18283f',
            activebackground='#422020',
            activeforeground='#ff9e9e',
            relief='flat',
            cursor='hand2',
            padx=12,
            pady=6,
            command=self.on_close
        )
        self.btn_exit.pack(side='right')

    def open_browser(self):
        webbrowser.open(self.app_url)

    def open_data_folder(self):
        if sys.platform == 'win32':
            os.startfile(DATA_DIR)
        else:
            subprocess.Popen(['xdg-open', DATA_DIR])

    def restart_service(self):
        self.server_badge.config(text='🔄 重启中...', bg='#23395d', fg='#f0e6d2')
        self.root.update_idletasks()
        threading.Thread(target=self._do_restart, daemon=True).start()

    def _do_restart(self):
        ok = self.manager.restart()
        time.sleep(1.0)
        self.root.after(0, self._update_badge_after_restart, ok)

    def _update_badge_after_restart(self, ok):
        if ok:
            self.server_badge.config(text='🟢 运行中', bg='#0a4436', fg='#00d2b4')
        else:
            self.server_badge.config(text='🔴 启动失败', bg='#521818', fg='#ff7b7b')

    def _start_server_and_poll(self):
        # 启动后台服务
        if not check_port_alive(self.port):
            self.manager.start()
        threading.Thread(target=self._poll_loop, daemon=True).start()

    def _poll_loop(self):
        while self.running:
            alive = check_port_alive(self.port)
            lcu = get_lcu_status(self.port) if alive else None
            self.root.after(0, self._apply_poll_update, alive, lcu)
            time.sleep(2.0)

    def _apply_poll_update(self, alive, lcu):
        if not self.running:
            return
        if alive:
            self.server_badge.config(text='🟢 运行中', bg='#0a4436', fg='#00d2b4')
            if not self.has_auto_opened:
                self.has_auto_opened = True
                self.open_browser()
        else:
            self.server_badge.config(text='🔴 未连接', bg='#521818', fg='#ff7b7b')

        if lcu and lcu.get('connected'):
            summoner = lcu.get('summoner')
            if summoner:
                name = summoner.get('gameName') or summoner.get('displayName') or '已连接'
                tag = f"#{summoner.get('tagLine')}" if summoner.get('tagLine') else ''
                self.lcu_label.config(text=f'🎮 召唤师：{name}{tag} (已直连)', fg='#00d2b4')
            else:
                self.lcu_label.config(text='🎮 已连接游戏客户端 (就绪)', fg='#00d2b4')
        elif lcu:
            self.lcu_label.config(text='⏳ 等待英雄联盟客户端启动...', fg='#c8aa6e')
        else:
            self.lcu_label.config(text='⚪ 服务启动中...', fg='#8fa3bf')

    def on_close(self):
        self.running = False
        try:
            self.manager.stop()
        except Exception:
            pass
        self.root.destroy()


def main():
    enable_dpi()
    port = 5179

    # 单例检测：如果已经有服务在运行，直接唤起浏览器并提示
    if check_port_alive(port):
        webbrowser.open(f'http://127.0.0.1:{port}')
        root = tk.Tk()
        root.withdraw()
        messagebox.showinfo(
            'LoL 对局实验室',
            'LoL 对局实验室已在后台运行中！\n已自动为您在默认浏览器中打开页面。'
        )
        sys.exit(0)

    manager = NodeServerManager(port=port)
    atexit.register(manager.stop)

    # 支持命令行参数 --headless / --no-gui
    if '--headless' in sys.argv or '--no-gui' in sys.argv:
        print(f'LoL Match Lab 正在无界面后台模式运行: http://127.0.0.1:{port}')
        manager.start()
        if '--no-open' not in sys.argv:
            time.sleep(1.0)
            webbrowser.open(f'http://127.0.0.1:{port}')
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            manager.stop()
            sys.exit(0)

    root = tk.Tk()
    app = AppUI(root, manager)
    root.mainloop()


if __name__ == '__main__':
    main()
