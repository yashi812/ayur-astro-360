import re
with open('c:/dev/ayur-astro-360/index.html', 'r', encoding='utf-8') as f:
    content = f.read()
new_content = re.sub(r'<img[^>]*src=\"data:image/[^>]*>', '', content)
with open('c:/dev/ayur-astro-360/index.html', 'w', encoding='utf-8') as f:
    f.write(new_content)
