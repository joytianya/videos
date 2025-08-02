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
TARGET_DOMAIN = 'www.olevod.tv'
TARGET_SCHEME = 'https'
TARGET_BASE_URL = f'{TARGET_SCHEME}://{TARGET_DOMAIN}'

# 创建session以复用连接
session = requests.Session()

# 检查是否有系统代理设置
import os
if os.environ.get('HTTP_PROXY') or os.environ.get('HTTPS_PROXY'):
    proxies = {
        'http': os.environ.get('HTTP_PROXY'),
        'https': os.environ.get('HTTPS_PROXY')
    }
    session.proxies.update(proxies)
    logger.info(f"使用系统代理: {proxies}")

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
                'tjh121e721.xn--9kqv5am2jbz1a.com'
            ])
            
            if needs_filtering:
                logger.info(f"开始HTML内容过滤，原始长度: {len(content)} 字符")
                
                # 合并所有广告移除操作为一次正则替换
                # 使用编译后的正则表达式提高性能
                ad_patterns = [
                    # 最完整的pc-ads容器（优先匹配）
                    r'<div[^>]*class="[^"]*pc-content[^"]*pc-ads[^"]*"[^>]*>.*?<a[^>]*href="[^"]*tjh121e721\.xn--9kqv5am2jbz1a\.com[^"]*"[^>]*>.*?</a>\s*</div>',
                    r'<div[^>]*class="[^"]*pc-content[^"]*pc-ads[^"]*"[^>]*>.*?<a[^>]*href="[^"]*2032\.sfdzxvcbdfhg2032\.cc[^"]*"[^>]*>.*?</a>\s*</div>',
                    # 通用pc-ads容器
                    r'<div[^>]*class="[^"]*pc-content[^"]*pc-ads[^"]*"[^>]*>.*?</div>',
                    r'<div[^>]*class="[^"]*pc-ads[^"]*"[^>]*>.*?</div>',
                    # swiper-slide广告容器
                    r'<div[^>]*class="[^"]*swiper-slide[^"]*"[^>]*>.*?<img[^>]*src="[^"]*static\.olelive\.com\/uploads\/file\/[^"]*"[^>]*>.*?</div>',
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
            
            # 注入精简版的广告拦截JavaScript代码
            ad_blocker_js = '''
<script type="text/javascript">
(function() {
    // 精简版广告拦截代码
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
    
    // DOM清理函数
    function cleanAds() {
        // 白名单：不要删除这些重要元素
        const protectedSelectors = [
            'input', 'button', 'form', 'nav', 'header', 'footer', 
            '[class*="search"]', '[id*="search"]', '[class*="menu"]',
            '[class*="nav"]', '[class*="header"]', '[class*="footer"]'
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
        
        // 清理pc-ads（只清理明确的广告容器）
        document.querySelectorAll('[class*="pc-ads"]').forEach(el => {
            if (!isProtected(el) && el.className.includes('pc-ads')) {
                el.remove();
            }
        });
        
        // 清理包含uploads/file的图片（只删除图片和swiper容器）
        document.querySelectorAll('img[src*="static.olelive.com/uploads/file/"]').forEach(img => {
            if (!isProtected(img)) {
                const swiperParent = img.closest('.swiper-slide');
                if (swiperParent && !isProtected(swiperParent)) {
                    swiperParent.remove();
                } else {
                    img.remove();
                }
            }
        });
        
        // 清理2032链接和新的广告域名链接（只删除链接本身）
        document.querySelectorAll('a[href*="2032.sfdzxvcbdfhg2032.cc"], a[href*="tjh121e721.xn--9kqv5am2jbz1a.com"]').forEach(link => {
            if (!isProtected(link)) {
                link.remove();
            }
        });
    }
    
    // 监听DOM变化
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) {
                    // 检查新增节点
                    if (node.matches && (
                        node.matches('[class*="pc-ads"]') ||
                        node.matches('.swiper-slide') && node.querySelector('img[src*="static.olelive.com/uploads/file/"]')
                    )) {
                        node.remove();
                    }
                }
            });
        });
    });
    
    // 启动监听
    observer.observe(document.body || document.documentElement, {childList: true, subtree: true});
    
    // 定时清理（优化版 - 减少频率）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(cleanAds, 1000); // 页面加载1秒后清理一次
        });
    } else {
        setTimeout(cleanAds, 500); // 如果页面已加载，0.5秒后清理一次
    }
})();
</script>
'''
            
            # 在</head>标签前插入广告拦截JS
            if '</head>' in content:
                content = content.replace('</head>', ad_blocker_js + '</head>')
                
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
            
        # 修改Referer头
        if key.lower() == 'referer':
            proxy_domain = get_proxy_domain()
            if proxy_domain in value:
                value = value.replace(f'://{proxy_domain}', f'://{TARGET_DOMAIN}')
        
        # 保留Cookie（重要：搜索功能可能需要）
        modified_headers[key] = value
    
    # 设置正确的Host头
    modified_headers['Host'] = TARGET_DOMAIN
    
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
            timeout=10,  # 减少超时时间
            verify=False  # 忽略SSL证书验证
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

