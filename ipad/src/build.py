import base64, re
A='/home/claude/app/'; P='/home/claude/ipad/'
css=open(A+'styles.css').read()
for f,m in [('mission-bg2.jpg','image/jpeg'),('cover-golf.jpg','image/jpeg')]:
    css=css.replace('url(%s)'%f,'url(data:%s;base64,%s)'%(m,base64.b64encode(open(A+f,'rb').read()).decode()))
live=open(A+'live.js').read()
live=live.replace("'logo-orvia-word.webp'","'data:image/webp;base64,%s'"%base64.b64encode(open(A+'logo-orvia-word.webp','rb').read()).decode())
pre="try{ if(!/[?&]debug=1/.test(location.search)) localStorage.setItem('orviaDebug','0'); }catch(e){}"
body=open(P+'body.html').read(); ic=open(P+'ipad.css').read(); ij=open(P+'ipad.js').read()
html=f'''<!doctype html>
<html lang="en" data-no-stand><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#ffffff">
<title>ORVIA Motion Tracking</title>
<style>{css}
{ic}</style></head>
<body>
{body}
<script>{pre}</script>
<script>{live}</script>
<script>{ij}</script>
</body></html>'''
open('/mnt/user-data/outputs/orvia-ipad-motion.html','w').write(html)
open(A+'ipad/index.html','w').write(html) if __import__('os').path.isdir(A+'ipad') else None
# artifact: same page; data-no-stand is set from script since there is no <html> tag
art=html.split('<body>')[1].split('</body>')[0]
head='<title>ORVIA Motion Tracking</title>\n<style>'+css+'\n'+ic+'</style>\n<script>document.documentElement.setAttribute("data-no-stand","")</script>\n'
open(P+'ipad.artifact.html','w').write(head+art)
print(len(html)//1024,'KB')
