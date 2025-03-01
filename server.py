import asyncio
import orjson as json
from sanic import html, Request, Sanic, text, Websocket
from textwrap import dedent
import time
import websockets

app = Sanic("MyHelloWorldApp")

with open('index.html', 'r') as f:
    _INDEX_HTML = f.read()

with open('index.js', 'r') as f:
    _INDEX_JS = f.read()

with open('index.css', 'r') as f:
    _INDEX_CSS = f.read()

waiting_websockets = dict()  # used as an ordered set
active_players = dict()
lock = asyncio.Lock()


@app.get('/')
async def index(request: Request):
    return html(_INDEX_HTML)


@app.get('/static/index.js')
async def index_js(request: Request):
    return text(_INDEX_JS, headers={ 'content-type': 'application/javascript' })


@app.get('/static/index.css')
async def index_css(request: Request):
    return text(_INDEX_CSS, headers={ 'content-type': 'text/css' })


# FIX ME: In case the error handling here is not quite correct, periodically
#         check for very old websocket connections and delete them from
#         waiting_websockets and active_players. Also log when at least
#         one such websocket is found, and log how many are found.
# TODO: Support more than 2 people playing together. 3 people might play
#       inside a hexagon, 4 people inside an octagon, etc.


# TODO: Make sure to not transmit more than a certain amount of events and/or
#       data from one client to another, to protect clients from each other.
@app.websocket('/ws')
async def ws(request: Request, ws: Websocket) -> None:
    try:
        async with lock:
            if ws in waiting_websockets or ws in active_players:
                # FIX ME: Send message to client that request was bad?
                # Bad request
                return

            if len(waiting_websockets) > 0:
                other_player_ws = next(iter(waiting_websockets))

                if other_player_ws.io_proto.websocket_peer is None or \
                        ws.io_proto.websocket_peer == other_player_ws.io_proto.websocket_peer:
                    # User probably refreshed page while waiting, and their old
                    # websocket hasn't been removed from waiting_websockets yet.
                    other_player_ws = None
            else:
                other_player_ws = None

            if other_player_ws is not None:
                del waiting_websockets[other_player_ws]
                assert other_player_ws not in active_players

                active_players[ws] = dict(
                    other_player_ws=other_player_ws,
                    player_id=1,
                )
                active_players[other_player_ws] = dict(
                    other_player_ws=ws,
                    player_id=2,
                )
                start_time = time.time_ns() // 1_000_000  # milliseconds

                await ws.send(json.dumps(dict(
                    type='server_start',
                    data=dict(
                        player_id=active_players[ws]['player_id'],
                        start_time=start_time,
                    ),
                )))
                await other_player_ws.send(json.dumps(dict(
                    type='server_start',
                    data=dict(
                        player_id=active_players[other_player_ws]['player_id'],
                        start_time=start_time,
                    ),
                )))
            else:
                # waiting_websockets is used as an ordered set. The value
                # is not used.
                waiting_websockets[ws] = None

        async for message in ws:
            await handle_message(ws, message)
    # An example of an error that may occur is
    # websockets.exceptions.ConnectionClosed (I think).
    finally:
        try:
            if ws in waiting_websockets:
                async with lock:
                    del waiting_websockets[ws]
        finally:
            if ws in active_players:
                try:
                    other_player_ws = active_players[ws]['other_player_ws']
                    await other_player_ws.close()
                finally:
                    async with lock:
                        del active_players[ws]


async def handle_message(ws: Websocket, message) -> None:
    m = json.loads(message)

    if not isinstance(m, dict):
        # FIX ME: Send message to client that request was bad?
        # Bad request
        return

    m_type = m.get('type', None)
    if m_type is None or not isinstance(m_type, str):
        # FIX ME: Send message to client that request was bad?
        # Bad request
        return

    match m_type:
        case 'client_update':
            # FIX ME: Only transmit a whitelist of event keys.
            # FIX ME: Refuse to transmit more than a certain number of events
            # FIX ME: Refuse to transmit an event with data larger than a certain limit.

            data = m.get('data', None)
            if data is None or not isinstance(data, dict):
                # FIX ME: Send message to client that request was bad?
                # Bad request
                return

            events = data.get('events', None)
            if events is None or not isinstance(events, list) or len(events) == 0:
                # FIX ME: Send message to client that request was bad?
                # Bad request
                return

            player_id = active_players[ws]['player_id']
            for event in events:
                event['player_id'] = player_id

            other_player_ws = active_players[ws]['other_player_ws']
            await other_player_ws.send(json.dumps(dict(
                type='server_update',
                data=dict(
                    events=events,
                ),
            )))
        case _:
            # FIX ME: Send message to client that request was bad
            # Bad request
            return
