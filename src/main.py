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
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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

def is_advertisement(url, content_type, content_length):
    """判断是否为广告内容"""
    url_lower = url.lower()
    
    # 只拦截明确的广告域名，不拦截主站资源
    explicit_ad_domains = [
        'googleads',
        'googlesyndication', 
        'doubleclick',
        'adsystem',
        'amazon-adsystem'
    ]
    
    for domain in explicit_ad_domains:
        if domain in url_lower:
            return True
    
    # 检查明确的广告关键词（避免误拦截loading等正常文件）
    explicit_ad_keywords = [
        'advertisement', 'banner', 'popup', 'promo',
        'sponsor', 'affiliate', 'tracking', 'analytics', 'adnxs'
    ]
    
    for keyword in explicit_ad_keywords:
        if keyword in url_lower:
            return True
    
    # 检查文件名中明确的广告模式
    ad_patterns = [
        'banner', 'ad_banner', '_ad_', 'popup', 'promo'
    ]
    
    for pattern in ad_patterns:
        if pattern in url_lower:
            return True
    
    return False

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
            logger.info(f"开始HTML内容过滤，原始长度: {len(content)} 字符")
            
            # 检查是否包含广告内容
            pc_ads_count = len(re.findall(r'pc-ads', content, re.IGNORECASE))
            gif_count = len(re.findall(r'\.gif', content, re.IGNORECASE))
            static_olelive_count = len(re.findall(r'static\.olelive\.com', content, re.IGNORECASE))
            
            logger.info(f"发现广告内容 - pc-ads: {pc_ads_count}, gif: {gif_count}, static.olelive: {static_olelive_count}")
            
            original_content = content
            
            # 精准拦截pc-ads广告容器（完整移除整个结构）
            before_len = len(content)
            
            # 移除完整的pc-ads广告div结构，包括所有嵌套内容
            # 模式1：标准的pc-ads容器
            ad_container_pattern1 = r'<div[^>]*class="[^"]*pc-content[^"]*pc-ads[^"]*"[^>]*>.*?</div>\s*</a>\s*</div>'
            content = re.sub(ad_container_pattern1, '', content, flags=re.IGNORECASE | re.DOTALL)
            
            # 模式2：更精确的匹配，包含2032域名
            ad_container_pattern2 = r'<div[^>]*class="[^"]*pc-content[^"]*pc-ads[^"]*"[^>]*>.*?<a[^>]*href="[^"]*2032\.sfdzxvcbdfhg2032\.cc[^"]*"[^>]*>.*?</a>\s*</div>'
            content = re.sub(ad_container_pattern2, '', content, flags=re.IGNORECASE | re.DOTALL)
            
            # 模式3：匹配包含uploads/file图片的pc-ads容器
            ad_container_pattern3 = r'<div[^>]*class="[^"]*pc-content[^"]*pc-ads[^"]*"[^>]*>.*?<img[^>]*src="[^"]*static\.olelive\.com\/uploads\/file\/[^"]*"[^>]*>.*?</div>'
            content = re.sub(ad_container_pattern3, '', content, flags=re.IGNORECASE | re.DOTALL)
            
            # 模式4：简化匹配，只要包含pc-ads类的div
            ad_container_pattern4 = r'<div[^>]*class="[^"]*pc-ads[^"]*"[^>]*>.*?</div>'
            content = re.sub(ad_container_pattern4, '', content, flags=re.IGNORECASE | re.DOTALL)
            
            if len(content) != before_len:
                logger.info(f"移除pc-ads广告容器: {before_len} -> {len(content)} 字符")
            
            # 备用方案：如果上面的模式没匹配到，尝试更简单的模式
            if len(content) == before_len:
                # 移除包含2032.sfdzxvcbdfhg2032.cc域名的完整链接
                before_len2 = len(content)
                content = re.sub(
                    r'<div[^>]*pc-ads[^>]*>.*?<a[^>]*2032\.sfdzxvcbdfhg2032\.cc[^>]*>.*?</a>.*?</div>',
                    '',
                    content,
                    flags=re.IGNORECASE | re.DOTALL
                )
                if len(content) != before_len2:
                    logger.info(f"移除广告链接容器: {before_len2} -> {len(content)} 字符")
            
            # 移除来自static.olelive.com的GIF文件，包括uploads/file目录下的所有图片
            before_len3 = len(content)
            # 移除static.olelive.com的GIF文件
            content = re.sub(
                r'<img[^>]*src="[^"]*static\.olelive\.com[^"]*\.gif[^"]*"[^>]*/?>\s*',
                '',
                content,
                flags=re.IGNORECASE
            )
            # 移除static.olelive.com/uploads/file/目录下的所有图片
            content = re.sub(
                r'<img[^>]*src="[^"]*static\.olelive\.com\/uploads\/file\/[^"]*"[^>]*/?>\s*',
                '',
                content,
                flags=re.IGNORECASE
            )
            # 备用清理规则：更宽松的匹配
            content = re.sub(
                r'<img[^>]*src="[^"]*static\.olelive\.com[^"]*uploads[^"]*file[^"]*"[^>]*>\s*',
                '',
                content,
                flags=re.IGNORECASE
            )
            
            # 清理包含uploads/file图片的swiper-slide容器（处理嵌套div）
            before_swiper = len(content)
            
            # 方法1：简化的swiper-slide清理
            content = re.sub(
                r'<div[^>]*class="[^"]*swiper-slide[^"]*"[^>]*>.*?<img[^>]*src="[^"]*static\.olelive\.com\/uploads\/file\/[^"]*"[^>]*>.*?</div>',
                '',
                content,
                flags=re.IGNORECASE | re.DOTALL
            )
            
            # 方法2：更宽松的匹配，任何包含swiper-slide和uploads/file的div
            content = re.sub(
                r'<div[^>]*swiper-slide[^>]*>.*?static\.olelive\.com\/uploads\/file\/.*?</div>',
                '',
                content,
                flags=re.IGNORECASE | re.DOTALL
            )
            
            # 方法3：最通用的匹配，任何包含uploads/file的div（小心使用）
            content = re.sub(
                r'<div[^>]*>.*?<img[^>]*src="[^"]*static\.olelive\.com\/uploads\/file\/[^"]*"[^>]*>.*?</div>',
                '',
                content,
                flags=re.IGNORECASE | re.DOTALL
            )
            
            # 额外的强力清理：使用更简单的字符串替换
            if 'static.olelive.com/uploads/file/' in content:
                # 直接查找并移除包含uploads/file的完整行或块
                lines = content.split('\n')
                filtered_lines = []
                i = 0
                while i < len(lines):
                    line = lines[i]
                    if 'static.olelive.com/uploads/file/' in line:
                        # 找到包含uploads/file的行，向前查找div开始
                        start_idx = i
                        # 向前查找div开始标签
                        for j in range(i-1, -1, -1):
                            if '<div' in lines[j] and ('swiper-slide' in lines[j] or 'csp' in lines[j] or 'class=' in lines[j]):
                                start_idx = j
                                break
                        
                        # 向后查找div结束标签
                        end_idx = i
                        div_count = 0
                        for j in range(start_idx, len(lines)):
                            if '<div' in lines[j]:
                                div_count += lines[j].count('<div')
                            if '</div>' in lines[j]:
                                div_count -= lines[j].count('</div>')
                                if div_count <= 0:
                                    end_idx = j
                                    break
                        
                        # 跳过从start_idx到end_idx的所有行
                        logger.info(f"行级过滤：跳过第{start_idx+1}到{end_idx+1}行（包含uploads/file图片）")
                        i = end_idx + 1
                    else:
                        filtered_lines.append(line)
                        i += 1
                
                if len(filtered_lines) != len(lines):
                    content = '\n'.join(filtered_lines)
                    logger.info(f"行级过滤完成: {len(lines)} -> {len(filtered_lines)} 行")
            if len(content) != before_len3:
                logger.info(f"移除static.olelive.com的广告图片: {before_len3} -> {len(content)} 字符")
            
            # 5. 注入广告拦截JavaScript代码
            ad_blocker_js = '''
<script type="text/javascript">
(function() {
    // 拦截动态广告加载
    const originalFetch = window.fetch;
    const originalXMLHttpRequest = window.XMLHttpRequest.prototype.open;
    
    // 广告域名黑名单
    const adDomains = [
        'static.olelive.com',
        '2032.sfdzxvcbdfhg2032.cc',
        'tjh121e721'
    ];
    
    // 特定路径广告拦截
    const adPaths = [
        'static.olelive.com/uploads/file/'
    ];
    
    // 拦截fetch请求（只拦截广告域名和GIF动画）
    window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string') {
            for (const domain of adDomains) {
                if (url.includes(domain)) {
                    console.log('拦截广告域名请求:', url);
                    return Promise.resolve(new Response('', {status: 204}));
                }
            }
            // 拦截特定路径的广告
            for (const path of adPaths) {
                if (url.includes(path)) {
                    console.log('拦截广告路径请求:', url);
                    return Promise.resolve(new Response('', {status: 204}));
                }
            }
            // 只拦截GIF动画（通常是广告），保留JPG/PNG等图片
            if (url.includes('.gif')) {
                console.log('拦截GIF广告动画:', url);
                return Promise.resolve(new Response('', {status: 204}));
            }
        }
        return originalFetch.apply(this, args);
    };
    
    // 拦截XMLHttpRequest（只拦截广告域名和GIF动画）
    window.XMLHttpRequest.prototype.open = function(method, url, ...args) {
        if (typeof url === 'string') {
            for (const domain of adDomains) {
                if (url.includes(domain)) {
                    console.log('拦截XHR广告域名请求:', url);
                    url = 'data:text/plain;base64,';
                    break;
                }
            }
            // 拦截特定路径的广告
            for (const path of adPaths) {
                if (url.includes(path)) {
                    console.log('拦截XHR广告路径请求:', url);
                    url = 'data:text/plain;base64,';
                    break;
                }
            }
            // 只拦截GIF动画
            if (url.includes('.gif')) {
                console.log('拦截XHR GIF广告:', url);
                url = 'data:text/plain;base64,';
            }
        }
        return originalXMLHttpRequest.call(this, method, url, ...args);
    };
    
    // 监听DOM变化，移除动态插入的广告
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                    // 专门检测pc-ads广告容器
                    if (node.className && typeof node.className === 'string') {
                        if (node.className.includes('pc-content') && node.className.includes('pc-ads')) {
                            console.log('移除pc-ads广告容器:', node);
                            node.remove();
                            return;
                        }
                        // 也检测只包含pc-ads的容器
                        if (node.className.includes('pc-ads')) {
                            console.log('移除pc-ads广告容器(简化):', node);
                            node.remove();
                            return;
                        }
                    }
                    
                    // 检查是否包含广告链接（2032域名）
                    if (node.tagName === 'A' && node.href) {
                        if (node.href.includes('2032.sfdzxvcbdfhg2032.cc') || 
                            node.href.includes('tjh121e721')) {
                            console.log('移除广告链接:', node.href);
                            node.remove();
                            return;
                        }
                    }
                    
                    // 移除广告图片
                    if (node.tagName === 'IMG' && node.src) {
                        // 移除GIF广告图片
                        if (node.src.includes('.gif') && 
                            (node.src.includes('static.olelive.com') || 
                             node.src.includes('2032.sfdzxvcbdfhg2032.cc'))) {
                            console.log('移除GIF广告图片:', node.src);
                            node.remove();
                            return;
                        }
                        // 移除特定路径的广告图片
                        for (const path of adPaths) {
                            if (node.src.includes(path)) {
                                console.log('移除广告路径图片:', node.src);
                                node.remove();
                                return;
                            }
                        }
                        // 额外检查：直接匹配static.olelive.com/uploads/file/路径
                        if (node.src.includes('static.olelive.com/uploads/file/')) {
                            console.log('移除uploads/file目录广告图片:', node.src);
                            node.remove();
                            return;
                        }
                    }
                    
                    // 检查子元素中的广告
                    const adContainers = node.querySelectorAll('.pc-content.pc-ads');
                    adContainers.forEach(function(container) {
                        console.log('移除子广告容器:', container);
                        container.remove();
                    });
                    
                    const adLinks = node.querySelectorAll('a[href*="2032.sfdzxvcbdfhg2032.cc"], a[href*="tjh121e721"]');
                    adLinks.forEach(function(link) {
                        console.log('移除子广告链接:', link.href);
                        link.remove();
                    });
                    
                    // 检查包含uploads/file图片的swiper-slide容器
                    const swiperSlides = node.querySelectorAll('.swiper-slide');
                    swiperSlides.forEach(function(slide) {
                        const uploadsImg = slide.querySelector('img[src*="static.olelive.com/uploads/file/"]');
                        if (uploadsImg) {
                            console.log('移除包含uploads/file图片的swiper-slide:', slide);
                            slide.remove();
                        }
                    });
                }
            });
        });
    });
    
    // 开始监听
    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });
    
    // 页面加载完成后清理一次
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
            // 清理pc-ads广告容器
            const adContainers = document.querySelectorAll('.pc-content.pc-ads');
            adContainers.forEach(function(container) {
                console.log('清理pc-ads广告容器:', container);
                container.remove();
            });
            
            // 清理所有包含pc-ads类的容器
            const allPcAds = document.querySelectorAll('[class*="pc-ads"]');
            allPcAds.forEach(function(container) {
                console.log('清理pc-ads广告容器(通用):', container);
                container.remove();
            });
            
            // 清理包含2032域名链接的容器
            const adLinkContainers = document.querySelectorAll('div');
            adLinkContainers.forEach(function(div) {
                const adLink = div.querySelector('a[href*="2032.sfdzxvcbdfhg2032.cc"]');
                if (adLink) {
                    console.log('清理包含2032域名的广告容器:', div);
                    div.remove();
                }
            });
            
            // 清理广告链接
            const adLinks = document.querySelectorAll('a[href*="2032.sfdzxvcbdfhg2032.cc"], a[href*="tjh121e721"]');
            adLinks.forEach(function(link) {
                console.log('清理广告链接:', link.href);
                link.remove();
            });
            
            // 清理广告图片
            const gifAds = document.querySelectorAll('img[src*=".gif"][src*="static.olelive.com"], img[src*=".gif"][src*="2032.sfdzxvcbdfhg2032.cc"]');
            gifAds.forEach(function(img) {
                console.log('清理GIF广告图片:', img.src);
                img.remove();
            });
            
            // 清理特定路径的广告图片
            adPaths.forEach(function(path) {
                const pathAds = document.querySelectorAll('img[src*="' + path + '"]');
                pathAds.forEach(function(img) {
                    console.log('清理广告路径图片:', img.src);
                    img.remove();
                });
            });
            
            // 额外清理：直接匹配static.olelive.com/uploads/file/路径下的所有图片
            const uploadsFileAds = document.querySelectorAll('img[src*="static.olelive.com/uploads/file/"]');
            uploadsFileAds.forEach(function(img) {
                console.log('清理uploads/file目录广告图片:', img.src);
                img.remove();
            });
            
            // 清理包含uploads/file图片的swiper-slide容器
            const swiperSlides = document.querySelectorAll('.swiper-slide');
            swiperSlides.forEach(function(slide) {
                const uploadsImg = slide.querySelector('img[src*="static.olelive.com/uploads/file/"]');
                if (uploadsImg) {
                    console.log('清理包含uploads/file图片的swiper-slide容器:', slide);
                    slide.remove();
                }
            });
            
            // 清理任何包含uploads/file图片的父容器
            const allUploadsImgs = document.querySelectorAll('img[src*="static.olelive.com/uploads/file/"]');
            allUploadsImgs.forEach(function(img) {
                // 向上查找并移除包含广告图片的容器
                let parent = img.parentElement;
                while (parent && parent !== document.body) {
                    if (parent.classList.contains('swiper-slide') || 
                        parent.classList.contains('csp') ||
                        parent.tagName === 'DIV') {
                        console.log('清理包含uploads/file图片的父容器:', parent);
                        parent.remove();
                        break;
                    }
                    parent = parent.parentElement;
                }
            });
        }, 1000);
    });
})();
</script>
'''
            
            # 在</head>标签前插入广告拦截JS
            if '</head>' in content:
                content = content.replace('</head>', ad_blocker_js + '</head>')
                logger.info("注入广告拦截JavaScript代码")
            
            # 总结过滤结果
            if len(content) != len(original_content):
                logger.info(f"HTML过滤完成: {len(original_content)} -> {len(content)} 字符 (减少 {len(original_content) - len(content)})")
            else:
                logger.info("HTML内容未发生变化，但已注入广告拦截代码")
                
        except Exception as e:
            logger.warning(f"HTML广告过滤失败: {e}")
    
    # 过滤JavaScript和CSS中的广告内容（精简版）
    elif 'javascript' in content_type.lower() or 'text/css' in content_type.lower():
        try:
            # 只移除明确的广告域名请求，不过度过滤
            original_length = len(content)
            
            # 只移除明确的广告域名
            ad_patterns = [
                r'["\']https?://.*2032\.sfdzxvcbdfhg2032\.cc[^"\']*\.gif[^"\']*["\']',
                r'["\']https?://.*tjh121e721[^"\']*["\']',
            ]
            
            for pattern in ad_patterns:
                content = re.sub(pattern, '""', content, flags=re.IGNORECASE)
            
            if len(content) != original_length:
                logger.info(f"JS/CSS精简过滤: {original_length} -> {len(content)} 字符")
            
        except Exception as e:
            logger.warning(f"JS/CSS过滤失败: {e}")
    
    # 替换绝对URL
    content = re.sub(
        rf'{TARGET_SCHEME}://{re.escape(TARGET_DOMAIN)}',
        proxy_base_url,
        content,
        flags=re.IGNORECASE
    )
    
    # 替换协议相对URL
    content = re.sub(
        rf'//{re.escape(TARGET_DOMAIN)}',
        f'//{proxy_domain}',
        content,
        flags=re.IGNORECASE
    )
    
    return content

def modify_request_headers(headers):
    """修改请求头"""
    modified_headers = {}
    
    for key, value in headers.items():
        # 跳过某些头部
        if key.lower() in ['host', 'content-length', 'connection', 'accept-encoding']:
            continue
            
        # 修改Referer头
        if key.lower() == 'referer':
            proxy_domain = get_proxy_domain()
            if proxy_domain in value:
                value = value.replace(f'://{proxy_domain}', f'://{TARGET_DOMAIN}')
        
        modified_headers[key] = value
    
    # 设置正确的Host头
    modified_headers['Host'] = TARGET_DOMAIN
    modified_headers['Accept-Encoding'] = 'identity'  # 禁用压缩以便处理内容
    
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
        content_length = response.headers.get('content-length')
        
        # 只拦截GIF图片（通常是广告动画），保留JPG/PNG等静态图片
        if 'image/gif' in content_type.lower() or target_url.lower().endswith('.gif'):
            logger.info(f"拦截GIF广告动画: {target_url}")
            # 返回1x1像素透明GIF
            transparent_gif = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x04\x01\x00;'
            return Response(transparent_gif, status=200, headers={'Content-Type': 'image/gif'})
        
        # 只拦截明确的广告域名（不拦截static.olelive.com，因为可能有正常资源）
        explicit_ad_domains = [
            '2032.sfdzxvcbdfhg2032.cc',
            'tjh121e721'
        ]
        
        for ad_domain in explicit_ad_domains:
            if ad_domain in target_url.lower():
                logger.info(f"拦截广告域名请求: {target_url}")
                return Response('', status=204)
        
        # 拦截static.olelive.com的GIF文件和uploads/file目录下的所有图片
        if 'static.olelive.com' in target_url.lower():
            if target_url.lower().endswith('.gif'):
                logger.info(f"拦截static.olelive.com的GIF文件: {target_url}")
                transparent_gif = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x04\x01\x00;'
                return Response(transparent_gif, status=200, headers={'Content-Type': 'image/gif'})
            elif '/uploads/file/' in target_url.lower():
                logger.info(f"拦截static.olelive.com/uploads/file/目录下的图片: {target_url}")
                # 根据文件扩展名返回相应的空图片
                if target_url.lower().endswith(('.jpg', '.jpeg')):
                    return Response(b'', status=204)
                elif target_url.lower().endswith('.png'):
                    return Response(b'', status=204)
                elif target_url.lower().endswith('.gif'):
                    transparent_gif = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x04\x01\x00;'
                    return Response(transparent_gif, status=200, headers={'Content-Type': 'image/gif'})
                else:
                    return Response('', status=204)
        
        # 检查其他广告内容
        if is_advertisement(target_url, content_type, content_length):
            logger.info(f"阻止广告请求: {target_url}")
            return Response('', status=204)  # No Content
        
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

