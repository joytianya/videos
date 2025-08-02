import os
import sys
import re
import requests
from urllib.parse import urljoin, urlparse
from flask import Flask, request, Response
from flask_cors import CORS
import logging
import gzip
import zlib

# DON'T CHANGE THIS !!!
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

app = Flask(__name__, static_folder=None)  # 禁用静态文件处理
CORS(app)  # 允许跨域请求

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 目标网站配置
TARGET_DOMAIN = 'nnyy.in'
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
    'Accept-Encoding': 'identity',  # 禁用压缩以避免解压问题
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
    """替换内容中的域名"""
    if not any(ct in content_type.lower() for ct in TEXT_CONTENT_TYPES):
        return content
    
    proxy_domain = get_proxy_domain()
    proxy_scheme = 'https' if request.is_secure else 'http'
    proxy_base_url = f'{proxy_scheme}://{proxy_domain}'
    
    # 只进行域名替换，不过滤广告
    if TARGET_DOMAIN in content:
        # 替换绝对URL
        content = content.replace(f'{TARGET_SCHEME}://{TARGET_DOMAIN}', proxy_base_url)
        # 替换协议相对URL
        content = content.replace(f'//{TARGET_DOMAIN}', f'//{proxy_domain}')
    
    return content

def modify_request_headers(headers):
    """修改请求头"""
    modified_headers = {}
    
    # 需要跳过的头部
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
            elif 'aideal.uno' in value:
                value = value.replace('aideal.uno', TARGET_DOMAIN)
        
        # 移除可能暴露代理的头部
        if key.lower() in ['x-forwarded-for', 'x-real-ip', 'x-forwarded-proto', 'x-forwarded-host']:
            continue
        
        modified_headers[key] = value
    
    # 设置正确的Host头
    modified_headers['Host'] = TARGET_DOMAIN
    
    # 添加更真实的浏览器头部
    modified_headers['Origin'] = TARGET_BASE_URL
    modified_headers['Referer'] = TARGET_BASE_URL
    
    # 确保有必要的头部，但不启用压缩
    if 'Accept-Encoding' not in modified_headers:
        modified_headers['Accept-Encoding'] = 'identity'
    
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
        
        logger.info(f"代理请求: {request.method} {target_url} (path={path})")
        
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
            timeout=15,
            verify=False,  # 忽略SSL证书验证
            stream=False
        )
        
        # 处理响应内容 - 首先处理编码
        content = response.content
        content_type = response.headers.get('content-type', '')
        content_encoding = response.headers.get('content-encoding', '').lower()
        
        # 如果内容被压缩，先解压
        if content_encoding:
            try:
                if content_encoding == 'gzip':
                    # 检查是否真的是gzip格式
                    if content.startswith(b'\x1f\x8b'):
                        content = gzip.decompress(content)
                        logger.info(f"解压缩gzip内容: {len(content)} 字节")
                    else:
                        logger.info("内容已经是未压缩格式")
                elif content_encoding == 'deflate':
                    content = zlib.decompress(content)
                    logger.info(f"解压缩deflate内容: {len(content)} 字节")
                elif content_encoding == 'br':
                    import brotli
                    content = brotli.decompress(content)
                    logger.info(f"解压缩brotli内容: {len(content)} 字节")
            except Exception as e:
                logger.info(f"内容未压缩或解压失败，使用原始内容: {e}")
        
        # 如果是文本内容，进行域名替换
        if any(ct in content_type.lower() for ct in TEXT_CONTENT_TYPES):
            try:
                text_content = content.decode('utf-8', errors='ignore')
                original_length = len(text_content)
                
                text_content = replace_domain_in_content(text_content, content_type)
                
                logger.info(f"内容处理: {original_length} 字符")
                
                content = text_content.encode('utf-8')
            except Exception as e:
                logger.warning(f"内容处理失败: {e}")
        
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