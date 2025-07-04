// ==UserScript==
// @name         夸克视频提取器(v26.2 - UI优化版)
// @namespace    http://tampermonkey.net/
// @version      26.2
// @description  在夸克网盘页面批量重命名视频文件，支持递归扫描和智能移动功能(UI优化版)
// @author       ChatGPT
// @match        https://pan.quark.cn/list*
// @match        https://pan.quark.cn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    // API 端点配置
    const API_CONFIG = {
        LIST_ENDPOINT: 'https://drive-pc.quark.cn/1/clouddrive/file/sort',
        RENAME_ENDPOINT: 'https://drive-pc.quark.cn/1/clouddrive/file/rename',
        MOVE_ENDPOINT: 'https://drive-pc.quark.cn/1/clouddrive/file/move'
    };

    // 视频文件扩展名
    const VIDEO_EXTENSIONS = new Set([
        'mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', 
        '3gp', 'rmvb', 'rm', 'asf', 'divx', 'vob', 'ts', 'm2ts', 
        'mts', 'f4v', 'ogv', 'mpg', 'mpeg'
    ]);

    // 页面元素选择器
    const SELECTORS = {
        FILENAME: [
            'div.filename-text',
            '.file-name',
            '.ant-table-cell .filename-text',
            '[data-node-key] .filename-text',
            '.file-item-name'
        ],
        ROW: [
            'tr.ant-table-row[data-row-key]',
            'div[data-node-key]',
            '.file-item',
            '.ant-table-row'
        ],
        TOOLBAR: [
            '.btn-operate',
            '.toolbar',
            '.operation-bar',
            '.file-operation'
        ],
        FOLDER_ICON: [
            'i.f-dir',
            '.file-icon.f-dir',
            '.icon-folder',
            'svg[class*="folder"]',
            '.anticon-folder'
        ]
    };

    // 通用样式（压缩版）
    const commonStyles = `
        .my-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 8px 16px;
            margin: 2px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .my-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
        .my-btn:active { transform: translateY(0); }
        .btn-secondary { background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%); }
        .btn-danger { background: linear-gradient(135deg, #fd79a8 0%, #e84393 100%); }
        .btn-success { background: linear-gradient(135deg, #55efc4 0%, #00b894 100%); }
        .btn-warning { background: linear-gradient(135deg, #fdcb6e 0%, #e17055 100%); }
        .btn-info { background: linear-gradient(135deg, #81ecec 0%, #00cec9 100%); }
        .my-modal {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.5); display: flex;
            justify-content: center; align-items: center; z-index: 10000;
        }
        .my-modal-content {
            background: white; padding: 20px; border-radius: 10px;
            max-width: 90%; max-height: 90%; overflow-y: auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .my-input-group { margin: 10px 0; }
        .my-input-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .my-input-group input, .my-input-group select {
            width: 100%; padding: 8px; border: 1px solid #ddd;
            border-radius: 4px; font-size: 14px;
        }
        .my-progress {
            width: 100%; height: 20px; background-color: #f0f0f0;
            border-radius: 10px; overflow: hidden; margin: 10px 0;
        }
        .my-progress-bar {
            height: 100%; background: linear-gradient(90deg, #667eea, #764ba2);
            transition: width 0.3s ease;
        }
        .my-log {
            background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px;
            padding: 10px; max-height: 300px; overflow-y: auto;
            font-family: monospace; font-size: 12px; white-space: pre-wrap;
        }
        .rename-preview-table {
            width: 100%; border-collapse: collapse; background: white; color: #333;
        }
        .rename-preview-table th, .rename-preview-table td {
            border: 1px solid #ddd; padding: 8px; text-align: left;
        }
        .rename-preview-table th { background-color: #f0f0f0; font-weight: bold; }
        .rename-preview-table .old-name { color: #666; }
        .rename-preview-table .new-name { color: #1890ff; font-weight: bold; }
        #status-overlay-v26 {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.88); z-index: 10000; display: flex;
            justify-content: center; align-items: center; text-align: center;
            color: white; flex-direction: column;
        }
        #status-h1-v26 { font-size: 28px; font-weight: bold; text-shadow: 2px 2px 4px black; }
        #status-p-v26 { font-size: 18px; margin-top: 15px; text-shadow: 1px 1px 2px black; }
        #status-detail-v26 { font-size: 14px; margin-top: 10px; color: #ccc; }
    `;

    // 工具函数
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function log(message) {
        console.log(`[视频提取器v26.2] ${message}`);
    }

    // 通用模态框创建函数
    function createModal(title, content, buttons = [], options = {}) {
        const modal = document.createElement('div');
        modal.className = 'my-modal';
        
        const width = options.width || '70%';
        const maxWidth = options.maxWidth || '700px';
        
        const buttonHtml = buttons.map(btn => 
            `<button id="${btn.id}" class="my-btn ${btn.class || 'btn-secondary'}" 
             style="${btn.style || ''}">${btn.text}</button>`
        ).join('');
        
        modal.innerHTML = `
            <div class="my-modal-content" style="width: ${width}; max-width: ${maxWidth};">
                <h3>${title}</h3>
                ${content}
                <div style="margin-top: 20px; text-align: center;">
                    ${buttonHtml}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 绑定按钮事件
        buttons.forEach(btn => {
            if (btn.onclick) {
                document.getElementById(btn.id).onclick = btn.onclick;
            }
        });
        
        return modal;
    }

    // 通用UI组件
    const UI = {
        // 创建信息框
        createInfoBox: (type, title, content) => {
            const colors = {
                success: { bg: '#f6ffed', border: '#52c41a', text: '#666' },
                warning: { bg: '#fff7e6', border: '#faad14', text: '#fa8c16' },
                info: { bg: '#f0f8ff', border: '#1890ff', text: '#666' }
            };
            const color = colors[type] || colors.info;
            return `<div style="margin: 15px 0; padding: 10px; background: ${color.bg}; 
                    border-radius: 5px; border-left: 4px solid ${color.border};">
                    <p style="margin: 0; color: ${color.text};">${title}<br>${content}</p></div>`;
        },

        // 创建预览表格
        createPreviewTable: (videos, isLargeList) => {
            let rows = '';
            if (isLargeList) {
                const first = videos.slice(0, 10).map((v, i) => 
                    `<tr><td>${i + 1}</td><td class="old-name">${v.file_name}</td><td class="new-name">${i + 1}-${v.file_name}</td></tr>`
                ).join('');
                const last = videos.slice(-10).map((v, i) => 
                    `<tr><td>${videos.length - 10 + i + 1}</td><td class="old-name">${v.file_name}</td><td class="new-name">${videos.length - 10 + i + 1}-${v.file_name}</td></tr>`
                ).join('');
                rows = first + `<tr style="background: #f0f0f0;"><td colspan="3" style="text-align: center; color: #666;">... 省略中间 ${videos.length - 20} 个文件 ...</td></tr>` + last;
            } else {
                rows = videos.map((v, i) => 
                    `<tr><td>${i + 1}</td><td class="old-name">${v.file_name}</td><td class="new-name">${i + 1}-${v.file_name}</td></tr>`
                ).join('');
            }
            return `<div style="max-height: 400px; overflow-y: auto; border: 1px solid #f0f0f0; border-radius: 4px;">
                    <table class="rename-preview-table">
                        <thead style="position: sticky; top: 0; background: white; z-index: 1;">
                            <tr><th style="width: 60px;">序号</th><th style="width: 45%;">原文件名</th><th style="width: 45%;">新文件名</th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table></div>`;
        },

        // 创建进度界面
        createProgressInterface: (progressId = 'progress', statusId = 'status', logId = 'log') => 
            `<div class="my-progress"><div class="my-progress-bar" id="${progressId}" style="width: 0%"></div></div>
            <div id="${statusId}">准备开始...</div><div class="my-log" id="${logId}"></div>`
    };

    function findElement(selectors, parent = document) {
        for (const selector of selectors) {
            const element = parent.querySelector(selector);
            if (element) return element;
        }
        return null;
    }

    function findElements(selectors, parent = document) {
        for (const selector of selectors) {
            const elements = parent.querySelectorAll(selector);
            if (elements.length > 0) return Array.from(elements);
        }
        return [];
    }

    function getElementInfo(element) {
        try {
            return {
                title: element.getAttribute('title') || '',
                text: element.textContent?.trim() || '',
                dataRowKey: element.getAttribute('data-row-key') || '',
                dataNodeKey: element.getAttribute('data-node-key') || '',
                pathname: element.getAttribute('pathname') || ''
            };
        } catch (e) {
            console.warn('获取元素信息时出错', e);
            return { title: '', text: '', dataRowKey: '', dataNodeKey: '', pathname: '' };
        }
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 添加样式
    function addStyles() {
        if (!document.getElementById('video-extractor-styles-v26')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'video-extractor-styles-v26';
            styleElement.textContent = commonStyles;
            document.head.appendChild(styleElement);
        }
    }

    // 状态显示函数
    function showStatus(status, log = '', detail = '') {
        let overlay = document.getElementById('status-overlay-v26');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'status-overlay-v26';
            overlay.innerHTML = `
                <h1 id="status-h1-v26"></h1>
                <p id="status-p-v26"></p>
                <div id="status-detail-v26"></div>
            `;
            document.body.appendChild(overlay);
        }
        document.getElementById('status-h1-v26').textContent = status;
        document.getElementById('status-p-v26').textContent = log;
        document.getElementById('status-detail-v26').textContent = detail;
        console.log(`[状态] ${status} - ${log} - ${detail}`);
    }

    function hideStatus() {
        const overlay = document.getElementById('status-overlay-v26');
        if (overlay) overlay.remove();
    }

    // 全局变量存储当前目录ID
    let cachedCurrentDirId = null;
    let dirIdUpdateTime = 0;

    // 拦截XMLHttpRequest来获取目录ID
    function interceptApiRequests() {
        const originalXHR = window.XMLHttpRequest;
        const originalFetch = window.fetch;
        
        // 拦截XMLHttpRequest
        window.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const originalOpen = xhr.open;
            
            xhr.open = function(method, url, ...args) {
                // 监听文件列表API请求
                if (url.includes('clouddrive/file/sort') || url.includes('clouddrive/file')) {
                    const urlObj = new URL(url, window.location.origin);
                    const pdir_fid = urlObj.searchParams.get('pdir_fid');
                    if (pdir_fid && pdir_fid !== '0' && pdir_fid !== cachedCurrentDirId) {
                        cachedCurrentDirId = pdir_fid;
                        dirIdUpdateTime = Date.now();
                        log(`通过API请求拦截获取目录ID: ${pdir_fid}`);
                    }
                }
                return originalOpen.apply(this, [method, url, ...args]);
            };
            
            return xhr;
        };
        
        // 拦截fetch请求
        window.fetch = function(url, options = {}) {
            if (typeof url === 'string' && (url.includes('clouddrive/file/sort') || url.includes('clouddrive/file'))) {
                const urlObj = new URL(url, window.location.origin);
                const pdir_fid = urlObj.searchParams.get('pdir_fid');
                if (pdir_fid && pdir_fid !== '0' && pdir_fid !== cachedCurrentDirId) {
                    cachedCurrentDirId = pdir_fid;
                    dirIdUpdateTime = Date.now();
                    log(`通过Fetch请求拦截获取目录ID: ${pdir_fid}`);
                }
            }
            return originalFetch.apply(this, arguments);
        };
    }

    // 分析页面中的数据（简化版）
    function extractDirIdFromPageData() {
        try {
            // 方法1: 查找window对象中的全局变量
            const globalVars = ['__INITIAL_STATE__', '__NEXT_DATA__', 'pageData', 'appData'];
            for (const varName of globalVars) {
                if (window[varName]) {
                    const dirId = findDirIdInObject(window[varName]);
                    if (dirId) {
                        log(`从全局变量 ${varName} 获取目录ID: ${dirId}`);
                        return dirId;
                    }
                }
            }
            
            // 方法2: 分析页面中的script标签内容
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                if (script.textContent) {
                    const dirIdMatch = script.textContent.match(/["']pdir_fid["']\s*:\s*["']([^"']+)["']/);
                    if (dirIdMatch && dirIdMatch[1] && dirIdMatch[1] !== '0') {
                        log(`从script标签获取目录ID: ${dirIdMatch[1]}`);
                        return dirIdMatch[1];
                    }
                }
            }
            
            // 方法3: 查找localStorage中的相关数据
            for (const key of Object.keys(localStorage)) {
                if (key.includes('dir') || key.includes('fid')) {
                    try {
                        const value = localStorage.getItem(key);
                        if (value) {
                            const parsed = JSON.parse(value);
                            const dirId = findDirIdInObject(parsed);
                            if (dirId) {
                                log(`从存储 ${key} 获取目录ID: ${dirId}`);
                                return dirId;
                            }
                        }
                    } catch (e) {
                        // 忽略JSON解析错误
                    }
                }
            }
            
        } catch (e) {
            log(`分析页面数据时出错: ${e.message}`);
        }
        
        return null;
    }

    // 在对象中递归查找目录ID
    function findDirIdInObject(obj, depth = 0) {
        if (depth > 3 || !obj || typeof obj !== 'object') return null;
        
        try {
            // 直接查找已知的目录ID字段
            const dirFields = ['pdir_fid', 'dir_fid', 'fid', 'folder_id', 'current_dir', 'currentDir'];
            for (const field of dirFields) {
                if (obj[field] && typeof obj[field] === 'string' && obj[field] !== '0' && obj[field].length > 5) {
                    return obj[field];
                }
            }
            
            // 递归查找子对象
            for (const key in obj) {
                if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
                    const dirId = findDirIdInObject(obj[key], depth + 1);
                    if (dirId) return dirId;
                }
            }
        } catch (e) {
            // 忽略错误
        }
        
        return null;
    }

    // 监听URL变化
    function monitorUrlChanges() {
        let lastUrl = window.location.href;
        
        const checkUrlChange = () => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                // URL发生变化，清除缓存的目录ID
                cachedCurrentDirId = null;
                dirIdUpdateTime = 0;
                log('检测到URL变化，清除缓存的目录ID');
                
                // 尝试从新URL获取目录ID
                setTimeout(() => {
                    const newDirId = getCurrentDirectoryId();
                    if (newDirId) {
                        log(`URL变化后获取到新的目录ID: ${newDirId}`);
                    }
                }, 500);
            }
        };
        
        // 监听popstate事件（浏览器前进后退）
        window.addEventListener('popstate', checkUrlChange);
        
        // 监听pushState和replaceState（SPA路由变化）
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function() {
            originalPushState.apply(this, arguments);
            setTimeout(checkUrlChange, 100);
        };
        
        history.replaceState = function() {
            originalReplaceState.apply(this, arguments);
            setTimeout(checkUrlChange, 100);
        };
        
        // 定期检查URL变化（备用方案）
        setInterval(checkUrlChange, 2000);
    }

    // 智能获取当前目录ID（升级版）
    function getCurrentDirectoryId() {
        // 如果有缓存且不超过30秒，直接返回
        if (cachedCurrentDirId && (Date.now() - dirIdUpdateTime) < 30000) {
            log(`使用缓存的目录ID: ${cachedCurrentDirId}`);
            return cachedCurrentDirId;
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        
        // 方法1: 从URL参数获取当前目录ID
        let dirId = urlParams.get('pdir_fid');
        if (dirId && dirId !== '0' && dirId.length > 5) {
            log(`从URL参数pdir_fid获取当前目录ID: ${dirId}`);
            cachedCurrentDirId = dirId;
            dirIdUpdateTime = Date.now();
            return dirId;
        }
        
        // 方法2: 从URL hash解析夸克网盘的路径结构
        if (window.location.hash) {
            const hash = decodeURIComponent(window.location.hash);
            log(`解析URL hash: ${hash}`);
            
            // 解析夸克网盘的hash路由格式：#/list/all/path1/path2/currentPath
            const hashMatch = hash.match(/#\/list\/all\/(.+)/);
            if (hashMatch && hashMatch[1]) {
                const pathParts = hashMatch[1].split('/');
                log(`路径部分: ${JSON.stringify(pathParts)}`);
                
                // 获取最后一个路径部分（当前目录）
                if (pathParts.length > 0) {
                    const lastPath = pathParts[pathParts.length - 1];
                    log(`最后路径部分: ${lastPath}`);
                    
                    // 提取目录ID（格式：{id}-{name} 或 {id}）
                    const pathId = extractIdFromPath(lastPath);
                    if (pathId && pathId !== '0' && pathId.length >= 10) {
                        log(`从hash路径提取当前目录ID: ${pathId}`);
                        cachedCurrentDirId = pathId;
                        dirIdUpdateTime = Date.now();
                        return pathId;
                    }
                }
            }
            
            // 备用：从hash参数获取
            const hashParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');
            dirId = hashParams.get('pdir_fid') || hashParams.get('fid') || hashParams.get('dir');
            if (dirId && dirId !== '0' && dirId.length > 5) {
                log(`从URL hash参数获取当前目录ID: ${dirId}`);
                cachedCurrentDirId = dirId;
                dirIdUpdateTime = Date.now();
                return dirId;
            }
        }
        
        // 方法3: 从URL路径解析（支持更多格式）
        const pathPatterns = [
            /\/list\/([a-zA-Z0-9_-]{10,})/,
            /\/folder\/([a-zA-Z0-9_-]{10,})/,
            /\/dir\/([a-zA-Z0-9_-]{10,})/,
            /\/([a-zA-Z0-9_-]{20,})\//
        ];
        
        for (const pattern of pathPatterns) {
            const match = window.location.pathname.match(pattern);
            if (match && match[1] && match[1] !== '0') {
                dirId = match[1];
                log(`从URL路径获取当前目录ID: ${dirId}`);
                cachedCurrentDirId = dirId;
                dirIdUpdateTime = Date.now();
                return dirId;
            }
        }
        
        // 方法4: 从页面数据中提取
        dirId = extractDirIdFromPageData();
        if (dirId && dirId !== '0' && dirId.length > 5) {
            cachedCurrentDirId = dirId;
            dirIdUpdateTime = Date.now();
            return dirId;
        }
        
        // 方法5: 从页面元素获取当前目录信息
        const breadcrumbLinks = document.querySelectorAll('a[href*="pdir_fid"], a[href*="fid"]');
        for (const link of breadcrumbLinks) {
            const match = link.href.match(/[?&](?:pdir_fid|fid)=([^&]+)/);
            if (match && match[1] && match[1] !== '0' && match[1].length > 5) {
                dirId = match[1];
                log(`从页面链接获取当前目录ID: ${dirId}`);
                cachedCurrentDirId = dirId;
                dirIdUpdateTime = Date.now();
                return dirId;
            }
        }
        
        // 方法6: 从页面title或meta信息获取
        const titleMatch = document.title.match(/(\w{20,})/);
        if (titleMatch && titleMatch[1]) {
            const potentialId = titleMatch[1];
            if (potentialId.length >= 10 && /^[a-zA-Z0-9_-]+$/.test(potentialId)) {
                log(`从页面标题推断可能的目录ID: ${potentialId}`);
                return potentialId;
            }
        }
        
        log(`无法自动获取当前目录ID`);
        return null;
    }

    // 从路径字符串中提取目录ID
    function extractIdFromPath(pathStr) {
        if (!pathStr || typeof pathStr !== 'string') {
            return null;
        }
        
        log(`提取路径ID: ${pathStr}`);
        
        // 格式1: {32位ID}-{名称} 如: "3b87ad5151a84f63bcfa219e25519a3e-3.小数除法"
        const dashSeparatedMatch = pathStr.match(/^([a-zA-Z0-9]{20,})-(.+)$/);
        if (dashSeparatedMatch && dashSeparatedMatch[1]) {
            log(`匹配格式 ID-名称: ${dashSeparatedMatch[1]}`);
            return dashSeparatedMatch[1];
        }
        
        // 格式2: 纯ID（如果整个路径就是ID）
        if (/^[a-zA-Z0-9_-]{20,}$/.test(pathStr) && pathStr !== '0') {
            log(`匹配纯ID格式: ${pathStr}`);
            return pathStr;
        }
        
        // 格式3: 从URL编码的路径中提取
        try {
            const decoded = decodeURIComponent(pathStr);
            if (decoded !== pathStr) {
                return extractIdFromPath(decoded);
            }
        } catch (e) {
            log(`URL解码失败: ${e.message}`);
        }
        
        // 格式4: 尝试从字符串开头提取长ID
        const leadingIdMatch = pathStr.match(/^([a-zA-Z0-9]{20,})/);
        if (leadingIdMatch && leadingIdMatch[1] && leadingIdMatch[1] !== '0') {
            log(`匹配开头ID格式: ${leadingIdMatch[1]}`);
            return leadingIdMatch[1];
        }
        
        log(`无法从路径提取ID: ${pathStr}`);
        return null;
    }

    // API请求函数
    async function sendApiRequest(pdir_fid, retries = 3, delayMs = 1500) {
        const fullCookie = document.cookie;
        if (!fullCookie || !fullCookie.includes('ctoken=')) {
            throw new Error("未能找到登录信息(Cookie)。请刷新页面后重试。");
        }

        const url = new URL(API_CONFIG.LIST_ENDPOINT);
        const params = new URLSearchParams({
            pdir_fid: pdir_fid,
            _size: '1000',
            _sort: 'file_type:asc,file_name:asc',
            pr: 'ucpro',
            fr: 'pc'
        });
        url.search = params.toString();

        log(`请求文件夹 ${pdir_fid}`);

        try {
            return await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url.toString(),
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Cookie': fullCookie,
                        'Referer': 'https://pan.quark.cn/',
                        'User-Agent': navigator.userAgent
                    },
                    timeout: 30000,
                    onload: res => {
                        try {
                            if (res.status === 200) {
                                const data = JSON.parse(res.responseText);
                                if (data.code === 0 || data.status === 200 || 
                                   (data.data && Array.isArray(data.data.list))) {
                                    resolve(data);
                                } else {
                                    reject(new Error(`API返回错误: ${data.message || data.msg || `code: ${data.code}`}`));
                                }
                            } else {
                                reject(new Error(`HTTP请求失败，状态码: ${res.status}`));
                            }
                        } catch (e) {
                            reject(new Error("解析服务器响应(JSON)时失败"));
                        }
                    },
                    onerror: () => reject(new Error('网络请求错误')),
                    ontimeout: () => reject(new Error('网络请求超时'))
                });
            });
        } catch (error) {
            if (retries > 0) {
                showStatus(`请求失败，正在重试..`, `(剩余 ${retries} 次尝试)`, error.message);
                await delay(delayMs);
                return sendApiRequest(pdir_fid, retries - 1, delayMs * 1.5);
            }
            throw error;
        }
    }

    // 重命名文件函数
    async function renameFile(fid, newName) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: API_CONFIG.RENAME_ENDPOINT + '?pr=ucpro&fr=pc&uc_param_str=',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': 'https://pan.quark.cn/',
                    'User-Agent': navigator.userAgent
                },
                data: JSON.stringify({
                    fid: fid,
                    file_name: newName
                }),
                onload: function(response) {
                    try {
                        const result = JSON.parse(response.responseText);
                        if (result.status === 200 && result.code === 0) {
                            resolve(result);
                        } else {
                            reject(new Error(`重命名失败: ${result.message || '未知错误'}`));
                        }
                    } catch (e) {
                        reject(new Error(`解析响应失败: ${e.message}`));
                    }
                },
                onerror: function(error) {
                    reject(new Error(`网络请求失败: ${error.message || '未知网络错误'}`));
                },
                ontimeout: function() {
                    reject(new Error('请求超时'));
                },
                timeout: 15000
            });
        });
    }

    // 移动文件函数
    async function moveFiles(fileIds, targetDirFid) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: API_CONFIG.MOVE_ENDPOINT + '?pr=ucpro&fr=pc&uc_param_str=',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': 'https://pan.quark.cn/',
                    'User-Agent': navigator.userAgent
                },
                data: JSON.stringify({
                    action: 'move',
                    filelist: Array.isArray(fileIds) ? fileIds : [fileIds],
                    to_pdir_fid: targetDirFid
                }),
                onload: function(response) {
                    try {
                        const result = JSON.parse(response.responseText);
                        if (result.status === 200 && result.code === 0) {
                            resolve(result);
                        } else {
                            reject(new Error(`移动失败: ${result.message || '未知错误'}`));
                        }
                    } catch (e) {
                        reject(new Error(`解析响应失败: ${e.message}`));
                    }
                },
                onerror: function(error) {
                    reject(new Error(`网络请求失败: ${error.message || '未知网络错误'}`));
                },
                ontimeout: function() {
                    reject(new Error('请求超时'));
                },
                timeout: 15000
            });
        });
    }

    // 递归扫描文件夹
    async function recursiveScanForVideos(itemInfo, allVideosList, depth = 0, maxDepth = 10) {
        const indent = '  '.repeat(depth);
        log(`${indent}扫描: ${itemInfo.name} (ID: ${itemInfo.id}, 类型: ${itemInfo.dir ? '文件夹' : '文件'})`);

        if (depth > maxDepth) {
            log(`${indent}达到最大递归深度 ${maxDepth}，停止扫描`);
            return;
        }

        // 如果是文件，检查是否为视频
        if (itemInfo.dir === false || itemInfo.dir === 0) {
            const nameParts = itemInfo.name.split('.');
            let fileExt = '';

            if (nameParts.length > 1) {
                const lastPart = nameParts.pop();
                if (lastPart && /^[a-zA-Z0-9]{1,4}$/.test(lastPart)) {
                    fileExt = lastPart.toLowerCase();
                }
            }

            if (fileExt && VIDEO_EXTENSIONS.has(fileExt)) {
                log(`${indent}  找到视频文件: ${itemInfo.name}`);
                allVideosList.push({
                    fid: itemInfo.id,
                    file_name: itemInfo.name,
                    size: itemInfo.size || 0,
                    pdir_fid: itemInfo.pdir_fid || '',
                    path: itemInfo.path || itemInfo.name
                });
            } else {
                log(`${indent}  跳过非视频文件: ${itemInfo.name}`);
            }
            return;
        }

        // 如果是文件夹，递归扫描
        showStatus(
            `正在扫描... (已找到${allVideosList.length} 个视频)`,
            `进入文件夹: ${itemInfo.name}`,
            `深度: ${depth + 1}`
        );

        try {
            const result = await sendApiRequest(itemInfo.id);

            // 提取文件列表
            let items = [];
            if (result?.data?.list) {
                items = result.data.list;
            } else if (result?.list) {
                items = result.list;
            } else if (Array.isArray(result?.data)) {
                items = result.data;
            }

            log(`${indent}  文件夹"${itemInfo.name}" 包含 ${items.length} 个项目`);

            if (items.length === 0) {
                log(`${indent}  文件夹为空`);
                return;
            }

            for (const item of items) {
                const subItemInfo = {
                    id: item.fid || item.id,
                    name: item.file_name || item.name || item.filename,
                    dir: item.dir === true || item.dir === 1 || item.file_type === 0,
                    size: item.size || 0,
                    pdir_fid: item.pdir_fid || itemInfo.id,
                    path: itemInfo.path ? `${itemInfo.path}/${item.file_name || item.name}` : (item.file_name || item.name)
                };

                if (!subItemInfo.id || !subItemInfo.name) {
                    log(`${indent}  跳过无效项目`);
                    continue;
                }

                await delay(100);
                await recursiveScanForVideos(subItemInfo, allVideosList, depth + 1, maxDepth);
            }
        } catch (error) {
            log(`${indent}  扫描文件夹失败: ${error.message}`);
            const userChoice = confirm(`获取文件夹"${itemInfo.name}" 内容失败: ${error.message}\n\n- 点击【确定】跳过此文件夹继续扫描。\n- 点击【取消】中止任务。`);
            if (!userChoice) throw new Error("任务被用户中止");
        }
    }

    // 扫描页面文件
    async function scanPageFiles() {
        // 添加事件阻止机制，防止意外导航
        let isScanning = true;
        const preventNavigation = (e) => {
            if (isScanning && e.target.closest('tr.ant-table-row')) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        document.addEventListener('click', preventNavigation, true);
        document.addEventListener('mousedown', preventNavigation, true);

        try {
            const allVisibleRows = findElements(SELECTORS.ROW);
            log(`找到 ${allVisibleRows.length} 个可见行`);

            if (allVisibleRows.length === 0) {
                // 备用方案：直接从文件名元素获取
                const fileNameElements = findElements(SELECTORS.FILENAME);
                if (fileNameElements.length === 0) {
                    throw new Error("无法在页面找到任何文件名元素");
                }

                const directItems = fileNameElements.map((nameEl, index) => {
                    const fileName = nameEl.title || nameEl.textContent?.trim() || `未知文件${index}`;
                    return {
                        id: `direct-${index}`,
                        name: fileName,
                        dir: false,
                        path: fileName
                    };
                }).filter(item => item.name.includes('.'));

                return directItems;
            }

            // 解析页面中的项目
            const initialItems = allVisibleRows.map((row, index) => {
                const nameElement = findElement(SELECTORS.FILENAME, row);
                const folderIcon = findElement(SELECTORS.FOLDER_ICON, row);
                const rowInfo = getElementInfo(row);

                // 文件夹检测
                let isFolder = false;
                let detectionMethod = '';

                if (folderIcon) {
                    isFolder = true;
                    detectionMethod = '图标';
                } else if (row.querySelector('[class*="folder"], [class*="dir"], [class*="directory"]')) {
                    isFolder = true;
                    detectionMethod = 'CSS类名';
                } else if (rowInfo.dataRowKey.includes('folder') || row.getAttribute('data-file-type') === '0') {
                    isFolder = true;
                    detectionMethod = 'data属性';
                } else if (rowInfo.pathname) {
                    isFolder = true;
                    detectionMethod = 'pathname属性';
                } else if (nameElement) {
                    const nameInfo = getElementInfo(nameElement);
                    const fileName = nameInfo.title || nameInfo.text || '';
                    const hasValidFileExtension = /\.[a-zA-Z0-9]{1,4}$/.test(fileName);
                    if (!hasValidFileExtension && fileName && fileName.length > 0) {
                        isFolder = true;
                        detectionMethod = '文件名特征';
                    }
                }

                const nameInfo = nameElement ? getElementInfo(nameElement) : { title: '', text: '' };
                const fileName = nameInfo.title || nameInfo.text || '未知项目';

                const item = {
                    id: rowInfo.dataRowKey || rowInfo.dataNodeKey || `row-${index}`,
                    name: fileName,
                    dir: isFolder,
                    path: '',
                    detectionMethod: detectionMethod
                };

                log(`项目解析: ${item.name} - ${item.dir ? '📁' : '📄'} (${detectionMethod || '默认'})`);
                return item;
            }).filter(item => item.id && item.name !== '未知项目');

            return initialItems;

        } finally {
            isScanning = false;
            document.removeEventListener('click', preventNavigation, true);
            document.removeEventListener('mousedown', preventNavigation, true);
        }
    }

    // 生成标准化文件名
    function generateStandardFileName(originalName, index) {
        let cleanName = originalName;
        // 移除可能已存在的序号前缀
        cleanName = cleanName.replace(/^\d+[-\.]\s*/, '');
        cleanName = cleanName.replace(/^第\d+[课讲节][-\.\s]*/, '');
        
        return `${index}-${cleanName}`;
    }

    // 扫描所有视频文件
    async function scanAllVideos() {
        log('开始扫描所有视频文件...');
        
        try {
            const initialItems = await scanPageFiles();
            
            if (initialItems.length === 0) {
                throw new Error("无法解析页面中的文件信息");
            }

            const itemNames = initialItems.map(item => `  - ${item.name} ${item.dir ? '(文件夹)' : '(文件)'}`).join('\n');
            
            if (!confirm(`即将开始扫描以下${initialItems.length} 个项目以提取所有视频文件：\n\n${itemNames}\n\n是否继续？`)) {
                return [];
            }

            showStatus('正在初始化扫描...', `处理${initialItems.length} 个起始项目`);
            const allVideos = [];

            for (let i = 0; i < initialItems.length; i++) {
                const item = initialItems[i];
                showStatus(
                    `正在扫描... (${i + 1}/${initialItems.length})`,
                    `当前项目: ${item.name}`,
                    `已找到${allVideos.length} 个视频文件`
                );
                await recursiveScanForVideos(item, allVideos);
                await delay(200);
            }

            log(`扫描完成，共找到 ${allVideos.length} 个视频文件`);
            return allVideos;

        } catch (error) {
            hideStatus();
            throw error;
        }
    }

    // 显示重命名预览（优化版）
    function showRenamePreview(videos) {
        const currentDirId = getCurrentDirectoryId();
        const isLargeList = videos.length > 20;
        
        // 构建内容
        const basicInfo = UI.createInfoBox('success', 
            `<strong>📊 编号信息：</strong>起始编号 1，结束编号 ${videos.length}`,
            `<strong>🔄 重命名规则：</strong>每次运行都从1开始重新编号<br><strong>🌐 扫描范围：</strong>递归扫描所有子文件夹中的视频文件`
        );
        
        const dirInfo = currentDirId && currentDirId !== '0' 
            ? UI.createInfoBox('info', 
                `<strong>📂 移动目标：</strong>当前目录 (ID: ${currentDirId})`,
                `<strong>🚀 移动功能：</strong>重命名后自动移动到当前目录`)
            : UI.createInfoBox('warning',
                `<strong>⚠️ 注意：</strong>无法自动检测当前目录ID`,
                `<strong>📂 移动操作：</strong>将在执行时提供选择（仅重命名 或 手动指定目录）`);
        
        const largeListTip = isLargeList 
            ? UI.createInfoBox('warning', 
                `<strong>💡 提示：</strong>文件较多，预览中只显示前10个和后10个文件`,
                `实际将重命名全部 ${videos.length} 个文件`)
            : '';
            
        const content = `
            ${basicInfo}
            ${dirInfo}
            ${largeListTip}
            <p style="margin: 10px 0; color: #666;">请仔细检查以下重命名方案，然后选择操作方式：</p>
            ${UI.createPreviewTable(videos, isLargeList)}
        `;
        
        const buttons = [
            { id: 'executeRename', text: `✅ 仅重命名 ${videos.length} 个文件`, class: 'btn-success',
              onclick: () => { document.body.removeChild(modal); executeRename(videos); } },
            { id: 'executeRenameAndMove', text: '🚀 重命名+智能移动到当前目录', class: 'btn-warning',
              onclick: () => { 
                  document.body.removeChild(modal);
                  const renameList = videos.map((video, index) => ({
                      fid: video.fid, originalName: video.file_name,
                      newName: generateStandardFileName(video.file_name, index + 1)
                  }));
                  executeRenameAndMove(renameList);
              } },
            { id: 'cancelRename', text: '❌ 取消', class: 'btn-secondary',
              onclick: () => document.body.removeChild(modal) }
        ];
        
        const modal = createModal(`📝 批量重命名预览 (共 ${videos.length} 个文件)`, content, buttons, 
            { width: '90%', maxWidth: '900px' });
    }

    // 执行重命名（简化版）
    async function executeRename(videos) {
        const content = `
            <div class="my-progress">
                <div class="my-progress-bar" id="renameProgress" style="width: 0%"></div>
            </div>
            <div id="renameStatus">准备开始...</div>
            <div class="my-log" id="renameLog"></div>
        `;
        
        const modal = createModal('🔄 正在执行重命名...', content, [
            { id: 'closeRenameModal', text: '关闭', style: 'display: none;' }
        ], { width: '60%', maxWidth: '600px' });
        
        const progressBar = document.getElementById('renameProgress');
        const statusDiv = document.getElementById('renameStatus');
        const logDiv = document.getElementById('renameLog');
        
        let successCount = 0;
        let failCount = 0;
        const total = videos.length;
        
        for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            const newName = generateStandardFileName(video.file_name, i + 1);
            
            try {
                statusDiv.textContent = `正在重命名: ${video.file_name}`;
                logDiv.textContent += `[${i + 1}/${total}] 重命名: ${video.file_name} -> ${newName}\n`;
                logDiv.scrollTop = logDiv.scrollHeight;
                
                await renameFile(video.fid, newName);
                successCount++;
                logDiv.textContent += `✅ 成功\n\n`;
                
            } catch (error) {
                failCount++;
                logDiv.textContent += `❌ 失败: ${error.message}\n\n`;
            }
            
            const progress = ((i + 1) / total) * 100;
            progressBar.style.width = `${progress}%`;
            
            if (i < videos.length - 1) {
                await delay(500);
            }
        }
        
        statusDiv.textContent = `重命名完成！成功: ${successCount}, 失败: ${failCount}`;
        document.getElementById('closeRenameModal').style.display = 'inline-block';
        document.getElementById('closeRenameModal').onclick = () => {
            document.body.removeChild(modal);
            if (successCount > 0) {
                setTimeout(() => window.location.reload(), 1000);
            }
        };
    }

    // 执行重命名+移动（优化版）
    async function executeRenameAndMove(renameList) {
        const content = UI.createProgressInterface('operationProgress', 'operationStatus', 'operationLog');
        const modal = createModal('🚀 正在执行重命名+移动...', content, [
            { id: 'closeOperationModal', text: '关闭', style: 'display: none;' }
        ]);
        
        const progress = document.getElementById('operationProgress');
        const status = document.getElementById('operationStatus');
        const log = document.getElementById('operationLog');
        
        let stats = { renameSuccess: 0, renameFail: 0, moveSuccess: 0, moveFail: 0 };
        const total = renameList.length;
        const renamedFiles = [];
        
        // 智能检测目录ID
        status.textContent = '🔍 正在智能检测当前目录...';
        log.textContent += '🔍 正在智能检测当前目录ID...\n';
        
        cachedCurrentDirId = null; dirIdUpdateTime = 0; // 强制重新检测
        
        let currentDirId = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            log.textContent += `尝试 ${attempt}/3: `;
            log.scrollTop = log.scrollHeight;
            
            currentDirId = getCurrentDirectoryId();
            if (currentDirId && currentDirId !== '0') {
                log.textContent += `✅ 成功获取目录ID: ${currentDirId}\n`;
                break;
            }
            log.textContent += `❌ 未获取到有效目录ID\n`;
            if (attempt < 3) {
                log.textContent += `等待1秒后重试...\n`;
                await delay(1000);
            }
        }
        
        // 处理检测失败的情况
        if (!currentDirId || currentDirId === '0') {
            log.textContent += '\n⚠️ 智能检测失败，提供用户选择...\n\n';
            modal.style.display = 'none';
            
            const userChoice = confirm(`🤖 智能检测当前目录失败\n\n可能的原因：\n• 页面还未完全加载\n• 您在根目录或特殊页面\n• 网络延迟或页面结构变化\n\n选择操作方式：\n【确定】= 仅执行重命名（推荐）\n【取消】= 手动输入目录ID`);
            modal.style.display = 'flex';
            
            if (!userChoice) {
                modal.style.display = 'none';
                const manualDirId = prompt(`🔧 手动输入目录ID\n\n请输入目标目录的ID（通常是一串字母数字）：\n\n💡 获取方法：\n1. 查看当前页面URL中的 pdir_fid 参数\n2. 在目标文件夹页面复制URL中的ID部分\n3. 留空则仅执行重命名操作\n\n示例：abc123def456ghi789`, '');
                modal.style.display = 'flex';
                
                if (manualDirId && manualDirId.trim().length > 5) {
                    currentDirId = manualDirId.trim();
                    log.textContent += `📝 用户手动输入目录ID: ${currentDirId}\n\n`;
                    if (!/^[a-zA-Z0-9_-]{6,}$/.test(currentDirId)) {
                        log.textContent += `⚠️ 警告：输入的目录ID格式可能不正确，将继续尝试...\n\n`;
                    }
                } else {
                    currentDirId = null;
                    log.textContent += `📝 用户选择仅执行重命名操作\n\n`;
                }
            } else {
                currentDirId = null;
                log.textContent += `📝 用户选择仅执行重命名操作\n\n`;
            }
        } else {
            log.textContent += `\n🎉 智能检测成功！当前目录ID: ${currentDirId}\n\n`;
        }
        
        // 第一阶段：重命名
        status.textContent = '第一阶段：批量重命名文件...';
        log.textContent += '📝 开始重命名操作...\n\n';
        
        for (let i = 0; i < renameList.length; i++) {
            const item = renameList[i];
            try {
                log.textContent += `[${i + 1}/${total}] 重命名: ${item.originalName} -> ${item.newName}\n`;
                log.scrollTop = log.scrollHeight;
                
                await renameFile(item.fid, item.newName);
                stats.renameSuccess++;
                renamedFiles.push({ fid: item.fid, newName: item.newName });
                log.textContent += `✅ 重命名成功\n\n`;
            } catch (error) {
                stats.renameFail++;
                log.textContent += `❌ 重命名失败: ${error.message}\n\n`;
            }
            
            progress.style.width = `${((i + 1) / total) * (currentDirId ? 70 : 100)}%`;
            if (i < renameList.length - 1) await delay(500);
        }
        
        // 第二阶段：移动
        if (renamedFiles.length > 0 && currentDirId) {
            status.textContent = '第二阶段：移动成功重命名的文件...';
            log.textContent += `\n🚀 开始移动操作...\n目标目录: ${currentDirId}\n准备移动 ${renamedFiles.length} 个文件...\n\n`;
            
            try {
                progress.style.width = '75%';
                await delay(500);
                
                await moveFiles(renamedFiles.map(f => f.fid), currentDirId);
                stats.moveSuccess = renamedFiles.length;
                log.textContent += `✅ 移动成功: 已将 ${stats.moveSuccess} 个文件移动到目标目录\n\n`;
            } catch (error) {
                stats.moveFail = renamedFiles.length;
                log.textContent += `❌ 移动失败: ${error.message}\n💡 文件已成功重命名，但移动失败。您可以手动移动这些文件。\n\n`;
            }
            progress.style.width = '100%';
        } else {
            log.textContent += currentDirId ? '\n⚠️ 没有成功重命名的文件，跳过移动操作\n' : '\n📁 跳过移动操作（用户选择或无法获取目录ID）\n';
            progress.style.width = '100%';
        }
        
        // 显示最终结果
        const successEmoji = currentDirId 
            ? (stats.renameSuccess === total && stats.moveSuccess === renamedFiles.length) ? '🎉' : '⚠️'
            : (stats.renameSuccess === total) ? '🎉' : '⚠️';
            
        status.textContent = currentDirId 
            ? `${successEmoji} 操作完成！重命名: ${stats.renameSuccess}/${total}, 移动: ${stats.moveSuccess}/${renamedFiles.length}`
            : `${successEmoji} 重命名完成！成功: ${stats.renameSuccess}, 失败: ${stats.renameFail}`;
        
        document.getElementById('closeOperationModal').style.display = 'inline-block';
        document.getElementById('closeOperationModal').onclick = () => {
            document.body.removeChild(modal);
            if (stats.renameSuccess > 0) setTimeout(() => window.location.reload(), 1000);
        };
    }

    // 批量重命名主函数
    async function batchRename() {
        try {
            const videos = await scanAllVideos();
            if (videos.length === 0) {
                alert('未找到视频文件');
                return;
            }
            
            showRenamePreview(videos);
        } catch (error) {
            alert(`批量重命名失败: ${error.message}`);
        }
    }

    // 创建按钮容器
    function createButtonContainer() {
        addStyles();
        
        if (document.getElementById('video-extractor-container-v26')) {
            return;
        }
        
        const toolbar = findElement(SELECTORS.TOOLBAR);
        if (!toolbar) {
            log('未找到工具栏，创建浮动按钮');
            
            const container = document.createElement('div');
            container.id = 'video-extractor-container-v26';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                background: rgba(255, 255, 255, 0.95);
                padding: 15px;
                border-radius: 10px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.3);
            `;
            
            container.innerHTML = `
                <div style="margin-bottom: 10px; font-weight: bold; color: #333;">🎬 夸克视频工具 v26.2</div>
                <button id="batchRenameVideos" class="my-btn btn-warning">🏷️ 批量重命名视频</button>
            `;
            
            document.body.appendChild(container);
        } else {
            log('找到工具栏，添加按钮');
            
            if (!document.getElementById('batchRenameVideos')) {
                const btn = document.createElement('button');
                btn.id = 'batchRenameVideos';
                btn.className = 'my-btn btn-warning';
                btn.textContent = '🎬 批量重命名视频';
                toolbar.insertBefore(btn, toolbar.firstChild);
            }
        }
        
        // 绑定事件
        const renameBtn = document.getElementById('batchRenameVideos');
        
        if (renameBtn && !renameBtn.onclick) {
            renameBtn.onclick = batchRename;
        }
        
        log('按钮容器创建完成');
    }

    // 页面加载完成后创建按钮
    function init() {
        log('夸克视频提取器v26.2优化版正在初始化...');
        
        // 启用智能目录ID检测功能
        try {
            interceptApiRequests();
            log('API请求拦截已启用');
        } catch (e) {
            log(`启用API请求拦截失败: ${e.message}`);
        }
        
        try {
            monitorUrlChanges();
            log('URL变化监听已启用');
        } catch (e) {
            log(`启用URL变化监听失败: ${e.message}`);
        }
        
        // 初始尝试获取目录ID
        setTimeout(() => {
            const initialDirId = getCurrentDirectoryId();
            if (initialDirId) {
                log(`初始化时获取到目录ID: ${initialDirId}`);
            } else {
                log('初始化时未能获取到目录ID，将在操作时动态检测');
            }
        }, 1000);
        
        // 创建UI按钮
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createButtonContainer);
        } else {
            createButtonContainer();
        }
        
        // 监听页面变化，重新创建按钮
        const observer = new MutationObserver(() => {
            if (!document.getElementById('video-extractor-container-v26') && 
                !document.getElementById('batchRenameVideos')) {
                setTimeout(createButtonContainer, 1000);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 定期尝试获取目录ID（在页面完全加载后）
        const intervalId = setInterval(() => {
            if (!cachedCurrentDirId) {
                const dirId = getCurrentDirectoryId();
                if (dirId) {
                    log(`定期检测获取到目录ID: ${dirId}`);
                    clearInterval(intervalId);
                }
            } else {
                clearInterval(intervalId);
            }
        }, 3000);
        
        // 30秒后停止定期检测
        setTimeout(() => {
            clearInterval(intervalId);
        }, 30000);
    }

    // 启动脚本
    log('夸克视频提取器v26.2优化版已启动');
    init();

})(); 
