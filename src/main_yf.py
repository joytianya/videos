import os
import sys
import re
import requests
from urllib.parse import urljoin, urlparse
from flask import Flask, request, Response
from flask_cors import CORS
import logging

# DON'T CHANGE THIS !!!
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 目标网站配置
TARGET_DOMAIN = 'yfsp.tv'
TARGET_SCHEME = 'https'
TARGET_BASE_URL = f'{TARGET_SCHEME}://{TARGET_DOMAIN}'

# 创建session以复用连接
session = requests.Session()

# 配置连接池参数
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# 配置重试策略
retry_strategy = Retry(
    total=3,
    status_forcelist=[429, 500, 502, 503, 504],
    allowed_methods=["HEAD", "GET", "OPTIONS"],  # 新版本使用allowed_methods
    backoff_factor=1
)

# 配置SSL设置
import ssl
import urllib3

# 禁用SSL警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 创建自定义HTTPAdapter类来处理SSL
class SSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers('DEFAULT@SECLEVEL=1')  # 降低安全级别以兼容更多服务器
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

# 配置HTTP适配器
adapter = HTTPAdapter(
    pool_connections=20,  # 增加连接池大小
    pool_maxsize=20,      # 增加最大连接数
    max_retries=retry_strategy,
    pool_block=False
)

# 使用自定义SSL适配器
ssl_adapter = SSLAdapter(
    pool_connections=20,
    pool_maxsize=20,
    max_retries=retry_strategy,
    pool_block=False
)

session.mount("http://", adapter)
session.mount("https://", ssl_adapter)  # 对HTTPS使用SSL适配器

# 检查是否有系统代理设置
import os

if os.environ.get('HTTP_PROXY') or os.environ.get('HTTPS_PROXY'):
    proxies = {
        'http': os.environ.get('HTTP_PROXY'),
        'https': os.environ.get('HTTPS_PROXY')
    }
    session.proxies.update(proxies)
    logger.info(f"使用系统代理: {proxies}")
else:
    # 如果没有系统代理，直接连接
    logger.info("未检测到系统代理，使用直连模式")

session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
})

# 需要替换的内容类型
TEXT_CONTENT_TYPES = [
    'text/html',
    'text/css',
    'application/javascript',
    'text/javascript',
    'application/json'
]

def get_proxy_domain():
    """获取代理域名"""
    return request.host

def replace_domain_in_content(content, content_type):
    """替换内容中的域名并移除广告"""
    if not any(ct in content_type.lower() for ct in TEXT_CONTENT_TYPES):
        return content
    
    proxy_domain = get_proxy_domain()
    proxy_scheme = 'https' if request.is_secure else 'http'
    proxy_base_url = f'{proxy_scheme}://{proxy_domain}'
    
    # 移除广告相关的HTML内容
    if 'text/html' in content_type.lower():
        try:
            # 快速检查是否需要过滤
            needs_filtering = any(keyword in content for keyword in [
                'pc-ads', 'static.olelive.com/uploads/file/', '2032.sfdzxvcbdfhg2032.cc',
                'tjh121e721.xn--9kqv5am2jbz1a.com', 'swiper-slide'
            ])
            
            if needs_filtering:
                logger.info(f"开始HTML内容过滤，原始长度: {len(content)} 字符")
                
                # 更强的服务器端广告过滤，包含您提到的swiper-slide广告
                ad_patterns = [
                    # 您提到的具体swiper-slide广告模式（最优先匹配）
                    r'<div[^>]*class="[^"]*swiper-slide[^"]*csp[^"]*"[^>]*data-swiper-autoplay="[^"]*"[^>]*>.*?<img[^>]*src="[^"]*static\.olelive\.com\/uploads\/file\/[^"]*"[^>]*>.*?<div[^>]*class="[^"]*pc-mask[^"]*swiper-mask-circle[^"]*"[^>]*></div>\s*</div>',
                    # 通用swiper-slide广告容器
                    r'<div[^>]*class="[^"]*swiper-slide[^"]*"[^>]*data-swiper-autoplay="[^"]*"[^>]*>.*?<img[^>]*src="[^"]*static\.olelive\.com\/uploads\/file\/[^"]*"[^>]*>.*?</div>',
                    r'<div[^>]*class="[^"]*swiper-slide[^"]*"[^>]*>.*?<img[^>]*src="[^"]*static\.olelive\.com\/uploads\/file\/[^"]*"[^>]*>.*?</div>',
                    # 最完整的pc-ads容器
                    r'<div[^>]*class="[^"]*pc-content[^"]*pc-ads[^"]*"[^>]*>.*?<a[^>]*href="[^"]*tjh121e721\.xn--9kqv5am2jbz1a\.com[^"]*"[^>]*>.*?</a>\s*</div>',
                    r'<div[^>]*class="[^"]*pc-content[^"]*pc-ads[^"]*"[^>]*>.*?<a[^>]*href="[^"]*2032\.sfdzxvcbdfhg2032\.cc[^"]*"[^>]*>.*?</a>\s*</div>',
                    # 通用pc-ads容器
                    r'<div[^>]*class="[^"]*pc-content[^"]*pc-ads[^"]*"[^>]*>.*?</div>',
                    r'<div[^>]*class="[^"]*pc-ads[^"]*"[^>]*>.*?</div>',
                    # 单独的广告链接
                    r'<a[^>]*href="[^"]*tjh121e721\.xn--9kqv5am2jbz1a\.com[^"]*"[^>]*>.*?</a>',
                    r'<a[^>]*href="[^"]*2032\.sfdzxvcbdfhg2032\.cc[^"]*"[^>]*>.*?</a>',
                    # uploads/file图片（最后处理）
                    r'<img[^>]*src="[^"]*static\.olelive\.com\/uploads\/file\/[^"]*"[^>]*/?>\s*',
                ]
                
                # 合并所有模式为一个大的正则表达式
                combined_pattern = '|'.join(f'({pattern})' for pattern in ad_patterns)
                compiled_regex = re.compile(combined_pattern, re.IGNORECASE | re.DOTALL)
                
                # 一次性替换所有匹配
                original_len = len(content)
                content = compiled_regex.sub('', content)
                
                if len(content) != original_len:
                    logger.info(f"HTML过滤完成: {original_len} -> {len(content)} 字符 (减少 {original_len - len(content)})")
            
            # 注入强化版的广告拦截JavaScript代码 - 在页面渲染前执行
            ad_blocker_js = '''
<script type="text/javascript">
(function() {
    // 立即执行的广告拦截代码 - 在DOM构建期间就开始工作
    const adPaths = ['static.olelive.com/uploads/file/', '2032.sfdzxvcbdfhg2032.cc', 'tjh121e721.xn--9kqv5am2jbz1a.com'];
    
    // 拦截网络请求
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && adPaths.some(path => url.includes(path))) {
            return Promise.resolve(new Response('', {status: 204}));
        }
        return originalFetch.apply(this, args);
    };
    
    // 拦截XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (typeof url === 'string' && adPaths.some(path => url.includes(path))) {
            // 重定向到空响应
            url = 'data:text/plain;base64,';
        }
        return originalXHROpen.call(this, method, url, ...args);
    };
    
    // 添加CSS规则立即隐藏广告元素
    const style = document.createElement('style');
    style.textContent = `
        /* 立即隐藏广告相关元素 */
        [class*="pc-ads"],
        .swiper-slide:has(img[src*="static.olelive.com/uploads/file/"]),
        .swiper-slide img[src*="static.olelive.com/uploads/file/"],
        a[href*="2032.sfdzxvcbdfhg2032.cc"],
        a[href*="tjh121e721.xn--9kqv5am2jbz1a.com"],
        img[src*="static.olelive.com/uploads/file/"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            width: 0 !important;
            height: 0 !important;
            position: absolute !important;
            left: -9999px !important;
        }
        
        /* 特别针对swiper轮播广告 */
        .swiper-slide[data-swiper-autoplay]:has(img[src*="static.olelive.com/uploads/file/"]) {
            display: none !important;
        }
        
        /* 隐藏包含广告图片的swiper容器 */
        .swiper-container:has(.swiper-slide img[src*="static.olelive.com/uploads/file/"]) .swiper-slide:has(img[src*="static.olelive.com/uploads/file/"]) {
            display: none !important;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
    
    // DOM清理函数 - 更激进的清理
    function cleanAds() {
        // 白名单：不要删除这些重要元素
        const protectedSelectors = [
            'input', 'button', 'form', 'nav', 'header', 'footer', 
            '[class*="search"]', '[id*="search"]', '[class*="menu"]',
            '[class*="nav"]', '[class*="header"]', '[class*="footer"]',
            '[class*="player"]', '[class*="video"]'
        ];
        
        // 检查元素是否应该被保护
        function isProtected(element) {
            return protectedSelectors.some(selector => {
                try {
                    return element.matches(selector) || element.closest(selector);
                } catch (e) {
                    return false;
                }
            });
        }
        
        // 清理pc-ads
        document.querySelectorAll('[class*="pc-ads"]').forEach(el => {
            if (!isProtected(el)) {
                el.remove();
            }
        });
        
        // 清理包含uploads/file的swiper-slide（您提到的具体问题）
        document.querySelectorAll('.swiper-slide').forEach(slide => {
            const adImg = slide.querySelector('img[src*="static.olelive.com/uploads/file/"]');
            if (adImg && !isProtected(slide)) {
                slide.remove();
            }
        });
        
        // 清理单独的广告图片
        document.querySelectorAll('img[src*="static.olelive.com/uploads/file/"]').forEach(img => {
            if (!isProtected(img)) {
                img.remove();
            }
        });
        
        // 清理广告链接
        document.querySelectorAll('a[href*="2032.sfdzxvcbdfhg2032.cc"], a[href*="tjh121e721.xn--9kqv5am2jbz1a.com"]').forEach(link => {
            if (!isProtected(link)) {
                link.remove();
            }
        });
    }
    
    // 立即执行一次清理
    cleanAds();
    
    // 监听DOM变化 - 实时拦截新增的广告元素
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    // 立即检查并移除广告元素
                    if (node.matches && (
                        node.matches('[class*="pc-ads"]') ||
                        (node.matches('.swiper-slide') && node.querySelector('img[src*="static.olelive.com/uploads/file/"]')) ||
                        node.matches('img[src*="static.olelive.com/uploads/file/"]') ||
                        node.matches('a[href*="2032.sfdzxvcbdfhg2032.cc"]') ||
                        node.matches('a[href*="tjh121e721.xn--9kqv5am2jbz1a.com"]')
                    )) {
                        node.remove();
                        return;
                    }
                    
                    // 检查子元素中是否有广告
                    if (node.querySelector) {
                        const adElements = node.querySelectorAll(`
                            [class*="pc-ads"],
                            .swiper-slide:has(img[src*="static.olelive.com/uploads/file/"]),
                            img[src*="static.olelive.com/uploads/file/"],
                            a[href*="2032.sfdzxvcbdfhg2032.cc"],
                            a[href*="tjh121e721.xn--9kqv5am2jbz1a.com"]
                        `);
                        adElements.forEach(adEl => adEl.remove());
                    }
                }
            });
        });
    });
    
    // 启动监听
    if (document.body) {
        observer.observe(document.body, {childList: true, subtree: true});
    } else {
        // 如果body还没有创建，等待它创建
        const bodyObserver = new MutationObserver(() => {
            if (document.body) {
                observer.observe(document.body, {childList: true, subtree: true});
                bodyObserver.disconnect();
                cleanAds(); // body创建后立即清理一次
            }
        });
        bodyObserver.observe(document.documentElement, {childList: true});
    }
    
    // 多个时间点的清理，确保覆盖所有可能的加载时机
    setTimeout(cleanAds, 0);      // 立即
    setTimeout(cleanAds, 100);    // 100ms后
    setTimeout(cleanAds, 500);    // 500ms后
    setTimeout(cleanAds, 1000);   // 1秒后
    setTimeout(cleanAds, 2000);   // 2秒后（处理延迟加载的广告）
    
    // DOM加载完成后的清理
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cleanAds);
    }
    
    // 页面完全加载后的清理
    if (document.readyState !== 'complete') {
        window.addEventListener('load', cleanAds);
    }
})();
</script>
'''
            
            # 在<head>标签开始后立即插入（确保最早执行）
            if '<head>' in content:
                content = content.replace('<head>', '<head>' + ad_blocker_js)
            elif '</head>' in content:
                content = content.replace('</head>', ad_blocker_js + '</head>')
            else:
                # 如果没有head标签，在html开始后插入
                content = content.replace('<html', ad_blocker_js + '<html', 1)
                
        except Exception as e:
            logger.warning(f"HTML广告过滤失败: {e}")
    
    # 过滤JavaScript和CSS中的广告内容（精简版）
    elif 'javascript' in content_type.lower() or 'text/css' in content_type.lower():
        try:
            # 只移除明确的广告域名
            if any(domain in content for domain in ['2032.sfdzxvcbdfhg2032.cc', 'tjh121e721']):
                content = re.sub(
                    r'["\']https?://[^"\']*(?:2032\.sfdzxvcbdfhg2032\.cc|tjh121e721)[^"\']*["\']',
                    '""',
                    content,
                    flags=re.IGNORECASE
                )
            
        except Exception as e:
            logger.warning(f"JS/CSS过滤失败: {e}")
    
    # 替换域名（使用更高效的方法）
    if TARGET_DOMAIN in content:
        # 替换绝对URL
        content = content.replace(f'{TARGET_SCHEME}://{TARGET_DOMAIN}', proxy_base_url)
        # 替换协议相对URL
        content = content.replace(f'//{TARGET_DOMAIN}', f'//{proxy_domain}')
    
    return content

def modify_request_headers(headers):
    """修改请求头"""
    modified_headers = {}
    
    # 需要跳过的头部（减少跳过的数量）
    skip_headers = ['host', 'content-length', 'connection']
    
    for key, value in headers.items():
        # 跳过某些头部
        if key.lower() in skip_headers:
            continue
            
        # 修改Referer头 - 改进反检测
        if key.lower() == 'referer':
            proxy_domain = get_proxy_domain()
            if proxy_domain in value:
                # 直接设置为目标域名，避免暴露代理域名
                value = value.replace(f'://{proxy_domain}', f'://{TARGET_DOMAIN}')
            # 如果是外部referer，也要处理
            elif 'aideal.uno' in value:
                value = value.replace('aideal.uno', TARGET_DOMAIN)
        
        # 移除可能暴露代理的头部
        if key.lower() in ['x-forwarded-for', 'x-real-ip', 'x-forwarded-proto', 'x-forwarded-host']:
            continue
        
        # 保留Cookie（重要：搜索功能可能需要）
        modified_headers[key] = value
    
    # 设置正确的Host头
    modified_headers['Host'] = TARGET_DOMAIN
    
    # 添加更真实的浏览器头部
    modified_headers['Origin'] = TARGET_BASE_URL
    modified_headers['Referer'] = TARGET_BASE_URL
    
    # 如果没有Accept-Encoding，添加一个
    if 'Accept-Encoding' not in modified_headers:
        modified_headers['Accept-Encoding'] = 'gzip, deflate, br'
    
    # 确保有User-Agent
    if 'User-Agent' not in modified_headers:
        modified_headers['User-Agent'] = session.headers['User-Agent']
    
    return modified_headers

def modify_response_headers(headers):
    """修改响应头"""
    modified_headers = {}
    proxy_domain = get_proxy_domain()
    
    for key, value in headers.items():
        # 跳过某些头部
        if key.lower() in ['content-encoding', 'content-length', 'transfer-encoding', 'connection']:
            continue
            
        # 修改Location头（重定向）
        if key.lower() == 'location':
            if TARGET_DOMAIN in value:
                proxy_scheme = 'https' if request.is_secure else 'http'
                value = value.replace(f'{TARGET_SCHEME}://{TARGET_DOMAIN}', f'{proxy_scheme}://{proxy_domain}')
        
        # 修改Set-Cookie中的域名
        if key.lower() == 'set-cookie':
            value = re.sub(rf'domain={re.escape(TARGET_DOMAIN)}', f'domain={proxy_domain}', value, flags=re.IGNORECASE)
        
        modified_headers[key] = value
    
    return modified_headers

@app.route('/', defaults={'path': ''}, methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])
@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])
def proxy(path):
    """代理所有请求"""
    try:
        # 构建目标URL
        target_url = urljoin(TARGET_BASE_URL, path)
        if request.query_string:
            target_url += '?' + request.query_string.decode('utf-8')
        
        logger.info(f"代理请求: {request.method} {target_url}")
        
        # 准备请求头
        headers = modify_request_headers(request.headers)
        
        # 准备请求数据
        data = None
        if request.method in ['POST', 'PUT', 'PATCH']:
            data = request.get_data()
        
        # 发送请求到目标服务器
        response = session.request(
            method=request.method,
            url=target_url,
            headers=headers,
            data=data,
            allow_redirects=False,
            timeout=15,  # 增加超时时间
            verify=False,  # 忽略SSL证书验证
            stream=False   # 不使用流式传输，避免连接池问题
        )
        
        # 检查是否为广告内容或GIF图片
        content_type = response.headers.get('content-type', '')
        
        # 快速路径：只对特定URL进行拦截
        url_lower = target_url.lower()
        
        # 拦截static.olelive.com/uploads/file/目录下的所有内容
        if 'static.olelive.com/uploads/file/' in url_lower:
            logger.info(f"拦截uploads/file目录内容: {target_url}")
            return Response('', status=204)
        
        # 拦截2032域名和新的广告域名
        if ('2032.sfdzxvcbdfhg2032.cc' in url_lower or 
            'tjh121e721' in url_lower or 
            'tjh121e721.xn--9kqv5am2jbz1a.com' in url_lower):
            logger.info(f"拦截广告域名: {target_url}")
            return Response('', status=204)
        
        # 只对GIF图片进行额外检查
        if url_lower.endswith('.gif') and 'static.olelive.com' in url_lower:
            logger.info(f"拦截GIF广告: {target_url}")
            transparent_gif = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x04\x01\x00;'
            return Response(transparent_gif, status=200, headers={'Content-Type': 'image/gif'})
        
        # 处理响应内容
        content = response.content
        
        # 如果是文本内容，进行域名替换
        if any(ct in content_type.lower() for ct in TEXT_CONTENT_TYPES):
            try:
                text_content = content.decode('utf-8', errors='ignore')
                original_length = len(text_content)
                
                text_content = replace_domain_in_content(text_content, content_type)
                filtered_length = len(text_content)
                
                if original_length != filtered_length:
                    logger.info(f"内容过滤: {original_length} -> {filtered_length} 字符")
                
                content = text_content.encode('utf-8')
            except Exception as e:
                logger.warning(f"内容处理失败: {e}")
                # 如果处理失败，直接返回原内容
                pass
        
        # 修改响应头
        response_headers = modify_response_headers(response.headers)
        
        # 创建Flask响应
        flask_response = Response(
            content,
            status=response.status_code,
            headers=response_headers
        )
        
        return flask_response
        
    except requests.exceptions.Timeout:
        logger.error("请求超时")
        return "请求超时", 504
    except requests.exceptions.RequestException as e:
        logger.error(f"请求失败: {e}")
        return f"代理请求失败: {e}", 502
    except Exception as e:
        logger.error(f"代理错误: {e}")
        return f"代理服务器错误: {e}", 500

@app.route('/health')
def health():
    """健康检查端点"""
    return "OK", 200

if __name__ == '__main__':
    print("启动代理服务器...")
    print(f"目标网站: {TARGET_BASE_URL}")
    app.run(host='0.0.0.0', port=8888, debug=False, threaded=True)

