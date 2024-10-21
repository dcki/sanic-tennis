from sanic import html, Request, Sanic, text, Websocket
from textwrap import dedent

app = Sanic("MyHelloWorldApp")

with open('index.js', 'r') as f:
    _INDEX_JS = f.read()


@app.get('/')
async def index(request: Request):
    content = '''
        <!doctype html>
        <html>
            <head>
                <meta charset="utf-8" />

                <!-- Disable favicon, until one is defined. https://stackoverflow.com/a/13416784/724752 -->
                <link rel="icon" href="data:;base64,iVBORw0KGgo=">
            </head>
            <body>
                <!-- TODO: Move to S3 -->
                <script src="/static/index.js"></script>
                <script>
                    reset();
                </script>
            </body>
        </html>
    '''
    return html(dedent(content).lstrip())


@app.get('/static/index.js')
async def index_js(request: Request):
    return text(_INDEX_JS, headers={ 'content-type': 'application/javascript' })


@app.websocket('/ws')
async def feed(request: Request, ws: Websocket):
    async for msg in ws:
        # Echo
        await ws.send(msg)
