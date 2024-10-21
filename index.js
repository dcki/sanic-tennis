// FIX ME: Put functions in meaningful sections or separate modules.

const PRINT_TRACE = false;

// FIX ME: Make smaller y values refer to visually lower areas of the game area and larger y values refer to visually higher areas, and make the rendering code translate those values into the values that the browser uses.
const LEVEL_WIDTH = 400;
const LEVEL_HEIGHT = 200;
const BALL_WIDTH = 10;
const BALL_HEIGHT = 10;
const PADDLE_WIDTH = 20;
const PADDLE_HEIGHT = 40;
const PADDLE_X_DISTANCE_FROM_SIDE = 20;
const INITIAL_BALL_X = 1;
const INITIAL_BALL_Y = 0;
const BALL_SPEED = 400;  // distance per second
const PADDLE_SPEED = 250;  // distance per second
// FIX ME: Try different angles and see if it behaves in a sane way
// FIX ME: Try setting dx to speed and dy to zero, and see if the speed looks similar to this
const INITIAL_BALL_ANGLE = Math.PI * 7 / 4;  // southeast
const INITIAL_BALL_DX = Math.cos(INITIAL_BALL_ANGLE) * BALL_SPEED;
const INITIAL_BALL_DY = -1 * Math.sin(INITIAL_BALL_ANGLE) * BALL_SPEED;
const INITIAL_PADDLE_1_X = PADDLE_X_DISTANCE_FROM_SIDE;
const INITIAL_PADDLE_1_Y = (LEVEL_HEIGHT / 2) - (PADDLE_HEIGHT / 2);
const INITIAL_PADDLE_2_X = LEVEL_WIDTH - PADDLE_WIDTH - PADDLE_X_DISTANCE_FROM_SIDE;
const INITIAL_PADDLE_2_Y = (LEVEL_HEIGHT / 2) - (PADDLE_HEIGHT / 2);
const KEY_CODE_UP = 38;
const KEY_CODE_DOWN = 40;
const RELEVANT_KEY_CODES = [
    KEY_CODE_UP,
    KEY_CODE_DOWN,
];

function start() {
    window.addEventListener('error', ev => {
        // Show error message
        document.querySelector('.error').style.display = '';

        // Show new game instructions
        document.querySelector('.new-game').style.display = '';
        // FIX ME: Make the error visible in small text. Make sure that it doesn't change the page layout. Also, make the page layout more durable.
    });

    // FIX ME: Define promise chain unhandled error handler.

    const context = makeContext();

    addKeyListeners(context);

    initializeUi();

    const socket = new WebSocket('/ws');
    socket.addEventListener('open', ev => {
        if (PRINT_TRACE) {
            console.log('WebSocket opened: ' + JSON.stringify(ev));
        }
        handleConnect(context, socket);
    });
    socket.addEventListener('close', ev => {
        // FIX ME: Make this comment less cryptic or delete it.
        // HACK: Pass ev to handleDisconnect.
        handleDisconnect(ev, context, socket);
    });
    socket.addEventListener('error', ev => {
        throw new Error(JSON.stringify(ev));
    });
    socket.addEventListener('message', ev => {
        // FIX ME: If text() fails, will an error be thrown, or will it only be observable in the promise chain and fail silently?
        // Relying on duck typing: ev.data should be a blob, which should define
        // a text() method. If not, an error will occur at some point.
        ev.data.text().then(text => {
            if (PRINT_TRACE) {
                console.log('Received message: ' + text)
            }
            handleMessage(socket, JSON.parse(text), context);
        });
    });
}

function makeContext() {
    const context = {
        started: false,
        ended: false,
        socket: null,
        startTime: null,
        playerId: null,
        events: [],
        unsentEvents: [],
        // NOTE: All values of this object must be scalar so that
        //       Object.assign() can be used to make a copy.
        state: {},
        // NOTE: All values of this object must be scalar so that
        //       Object.assign() can be used to make a copy.
        snapshot: {},
        intervalHandles: [],
        isKeyPressedForCode: {},
    };

    for (const code of RELEVANT_KEY_CODES) {
        context.isKeyPressedForCode[code] = false;
    }

    const state = context.state;
    state.time = 0;
    state.ballX = INITIAL_BALL_X;
    state.ballY = INITIAL_BALL_Y;
    state.ballDx = INITIAL_BALL_DX;
    state.ballDy = INITIAL_BALL_DY;
    state.paddle1X = INITIAL_PADDLE_1_X;
    state.paddle1Y = INITIAL_PADDLE_1_Y;
    state.paddle1Dy = 0;
    state.paddle2X = INITIAL_PADDLE_2_X;
    state.paddle2Y = INITIAL_PADDLE_2_Y;
    state.paddle2Dy = 0;

    context.snapshot = Object.assign({}, state);  // copy

    return context;
}

// FIX ME: Prevent scrolling with keys *while game is in progress* (not before or after game)
function addKeyListeners(context) {
    // FIX ME: document or window?
    window.addEventListener('keydown', ev => {
        if (ev.repeat) {
            return;
        }
        if (!context.started) {
            return;
        }

        const code = ev.keyCode;
        if (!RELEVANT_KEY_CODES.includes(code)) {
            return;
        }
        if (context.isKeyPressedForCode[code]) {
            throw new Error(`keydown: Key ${code} is recorded as already being down.`);
        }

        context.isKeyPressedForCode[code] = true;
        const ev2 = {
            type: 'keydown',
            data: {
                key_code: ev.keyCode,
            },
            time: Date.now() - context.startTime,
            player_id: context.playerId,
        }
        context.events.push(ev2);
        context.unsentEvents.push(ev2);
        context.state = updateState(context.state, [ev2], context);
        if (context.state.ended) {
            return;
        }
    }, false);

    // FIX ME: document or window?
    window.addEventListener('keyup', ev => {
        if (!context.started) {
            return;
        }

        const code = ev.keyCode;
        if (!RELEVANT_KEY_CODES.includes(code)) {
            return;
        }
        if (!context.isKeyPressedForCode[code]) {
            // NOTE: Can happen if key was already down before game started.
            console.warn(`keyup: Key ${code} is recorded as already being up. Ignoring.`);
            return;
        }

        context.isKeyPressedForCode[code] = false;
        const ev2 = {
            type: 'keyup',
            data: {
                key_code: ev.keyCode,
            },
            time: Date.now() - context.startTime,
            player_id: context.playerId,
        }
        context.events.push(ev2);
        context.unsentEvents.push(ev2);
        context.state = updateState(context.state, [ev2], context);
        if (context.state.ended) {
            return;
        }
    }, false);
}

function initializeUi() {
    const gameEl = document.querySelector('.game-field');
    const paddle1El = document.querySelector('.paddle-1');
    const paddle2El = document.querySelector('.paddle-2');
    const ballEl = document.querySelector('.ball');

    gameEl.style.width = LEVEL_WIDTH.toString() + 'px';
    gameEl.style.height = LEVEL_HEIGHT.toString() + 'px';

    paddle1El.style.width = PADDLE_WIDTH.toString() + 'px';
    paddle1El.style.height = PADDLE_HEIGHT.toString() + 'px';

    paddle2El.style.width = PADDLE_WIDTH.toString() + 'px';
    paddle2El.style.height = PADDLE_HEIGHT.toString() + 'px';

    ballEl.style.width = BALL_WIDTH.toString() + 'px';
    ballEl.style.height = BALL_HEIGHT.toString() + 'px';
}

function handleConnect(context, socket) {
    context.socket = socket;

    // Show waiting
    document.querySelector('.waiting').style.display = '';

    initializeIntervals(context);
}

function handleDisconnect(ev, context, socket) {
    // TODO: Decide whether or not to show this.
    // Show server disconnected message
    //document.querySelector('.server-disconnected').style.display = '';

    // Show new game instructions
    document.querySelector('.new-game').style.display = '';

    endGame(context);

    if (ev.wasClean) {
        if (PRINT_TRACE) {
            console.log('WebSocket closed: ' + JSON.stringify([ev.code, ev.reason, ev.wasClean]));
        }
    } else {
        throw new Error('WebSocket closed: ' + JSON.stringify([ev.code, ev.reason, ev.wasClean]));
    }
}

function handleMessage(socket, message, context) {
    switch (message.type) {
        case 'server_start':
            // Hide waiting
            document.querySelector('.waiting').style.display = 'none';

            // Show game
            document.querySelector('.game-field').style.display = '';

            const countdownStartTime = Date.now();
            const countdownEl = document.querySelector('.countdown');
            const startingInterval = setInterval(() => {
                const now = Date.now();
                if (now < countdownStartTime + 1000) {
                    countdownEl.innerText = '3';
                } else if (now < countdownStartTime + 2000) {
                    countdownEl.innerText = '2';
                } else if (now < countdownStartTime + 3000) {
                    countdownEl.innerText = '1';
                } else {
                    countdownEl.innerText = '';
                    countdownEl.style.display = 'none';

                    context.startTime = now;
                    context.started = true;

                    // Hide paddle hint
                    document.querySelector('.paddle-hint').style.display = 'none';

                    clearInterval(startingInterval);
                }
            }, 10);

            context.playerId = message.data.player_id;

            highlightPlayerPaddle(context.playerId);
            updateUi(context);

            break;
        case 'server_update':
            if (message.data.events.length === 0) {
                console.error('Server unexpectedly sent server_update with empty events. Ignoring.');
                return;
            }

            // FIX ME: Throw an error if incoming events from message have time before snapshot time, since that should only be possible if other client is broken or lying.
            // Merge incoming events with known events.
            const updatedEvents = [];
            let i = 0;
            let j = 0;
            while (i < context.events.length || j < message.data.events.length) {
                const localEvent = context.events[i];
                const remoteEvent = message.data.events[j];

                if (localEvent === undefined && remoteEvent === undefined) {
                    throw new Error('localEvent and remoteEvent are both undefined.');  // assert
                }

                if (localEvent !== undefined && remoteEvent !== undefined) {
                    if (localEvent.time < remoteEvent.time) {
                        updatedEvents.push(localEvent);
                        i++;
                    } else {
                        updatedEvents.push(remoteEvent);
                        j++;
                    }
                } else if (remoteEvent === undefined) {
                    updatedEvents.push(localEvent);
                    i++;
                } else if (localEvent === undefined) {
                    updatedEvents.push(remoteEvent);
                    j++;
                } else {
                    throw new Error('Could not determine which event is next');  // assert
                }
            }
            context.events = [];

            context.state = updateState(context.snapshot, updatedEvents, context);
            if (context.state.ended) {
                return;
            }

            context.snapshot = Object.assign({}, context.state);  // copy

            break;
        default:
            throw new Error(`Unexpected message type ${type}`);
    }
}

function initializeIntervals(context) {
    context.intervalHandles.push(setInterval(() => {
        if (!context.started) {
            return;
        }
        context.state = updateState(context.state, [], context);
        if (context.state.ended) {
            return;
        }
        updateUi(context);
    }, 20));
    context.intervalHandles.push(setInterval(() => {
        if (!context.started) {
            return;
        }
        if (context.unsentEvents.length > 0) {
            context.socket.send(JSON.stringify({
                type: 'client_update',
                data: {
                    events: context.unsentEvents.map(
                        ({ type, data, time }) => {
                            return { type, data, time };
                        }
                    ),
                },
            }));
            context.unsentEvents = [];
        }
        // FIX ME: If no server_update has occurred in a long time then quit.
    }, 50));
}

function highlightPlayerPaddle(playerId) {
    const paddleHintEl = document.querySelector('.paddle-hint');
    paddleHintEl.innerText = `You are player ${playerId}`;
    const textWidth = 60;
    paddleHintEl.style.width = textWidth.toString() + 'px';
    switch (playerId) {
        case 1:
            paddleHintEl.style.left = (INITIAL_PADDLE_1_X + PADDLE_WIDTH + 10).toString() + 'px';
            paddleHintEl.style.top = INITIAL_PADDLE_1_Y.toString() + 'px';
            break;
        case 2:
            paddleHintEl.style.left = (INITIAL_PADDLE_2_X - 10 - textWidth).toString() + 'px';
            paddleHintEl.style.top = INITIAL_PADDLE_2_Y.toString() + 'px';
            break;
        default:
            throw new Error(`Unknown player id ${playerId}`);
    }
}

function updateUi(context) {
    const state = context.state;
    const paddle1El = document.querySelector('.paddle-1');
    const paddle2El = document.querySelector('.paddle-2');
    const ballEl = document.querySelector('.ball');

    paddle1El.style.left = state.paddle1X.toString() + 'px';
    paddle1El.style.top = state.paddle1Y.toString() + 'px';

    paddle2El.style.left = state.paddle2X.toString() + 'px';
    paddle2El.style.top = state.paddle2Y.toString() + 'px';

    ballEl.style.left = state.ballX.toString() + 'px';
    ballEl.style.top = state.ballY.toString() + 'px';
}

function updateState(state, events, context) {
    state = Object.assign({}, state);  // copy
    const now = Date.now() - context.startTime;

    let eventTime = state.time;
    for (const ev of events) {
        while (eventTime < ev.time) {
            tick(state, context);
            if (context.ended) {
                return state;
            }
            eventTime++;
        }
        // NOTE: If multiple events have the same time then tick() is not called
        //       between them, so, for example, if a keydown and keyup have the
        //       same time, then together they will have no effect. In that
        //       specific case the result should be correct, but if a new event
        //       type is introduced in the future then this will need to be
        //       re-assessed.
        switch (ev.type) {
            case 'keydown':
                let paddleDy;
                switch (ev.data.key_code) {
                    case KEY_CODE_UP:
                        paddleDy = -PADDLE_SPEED / 1000;
                        break;
                    case KEY_CODE_DOWN:
                        paddleDy = PADDLE_SPEED / 1000;
                        break;
                    default:
                        throw new Error(`Unexpected key code ${ev.data.key_code}`);
                }
                switch (ev.player_id) {
                    case 1:
                        state.paddle1Dy = paddleDy;
                        break;
                    case 2:
                        state.paddle2Dy = paddleDy;
                        break;
                    default:
                        throw new Error(`Unexpected player id ${ev.player_id}`);
                }
                break;
            case 'keyup':
                switch (ev.player_id) {
                    case 1:
                        state.paddle1Dy = 0;
                        break;
                    case 2:
                        state.paddle2Dy = 0;
                        break;
                    default:
                        throw new Error(`Unexpected player id ${ev.player_id}`);
                }
                break;
            default:
                throw new Error(`Unexpected event type ${ev.type}`);
        }
    }
    // FIX ME: It may be important to compare `<= now`. May need to remember what the last tick time executed was.
    // FIX ME: Revise or delete this comment:
    // NOTE: Can't check `<= now` because then every time this function is called then this will be executed again... This whole function (updateState) seems slightly wrong.
    while (eventTime < now) {
        tick(state, context);
        if (context.ended) {
            return state;
        }
        eventTime++;
    }

    state.time = now;

    return state;
}

// FIX ME: Re-assess the order of the things done in this function.
// FIX ME: Prevent paddles from leaving game area.
// FIX ME: Make part of paddle that ball collides with influence ball's new direction, using distance from center of paddle
// FIX ME: Make top and bottom corners of paddle, closest to center of game area, reverse ball's direction
// FIX ME: Make top and bottom corners of paddle, farthest from center of game area, reverse only ball's dy. (Player has already lost, but extra realism is fun.)
// FIX ME: Make velocity of paddle influence ball's new velocity, up to a maximum that network latencies can support.
// Called once per millisecond.
function tick(state, context) {
    // FIX ME: So that the word "state" doesn't need to be written and read so much by humans, extract its values at the beginning of this function and assign them at the end.

    state.paddle1Y += state.paddle1Dy;

    state.paddle2Y += state.paddle2Dy;

    // FIX ME: Take into account how much they overlap to determine ball's new position. If they overlap a little, then the ball should end up closer to the paddle. If they overlap a lot, then the ball should end up farther from the paddle.
    // If ball collides with a paddle, then change ball direction to move toward
    // center of game area, if it is not already.
    if (
        state.paddle1Y <= state.ballY + BALL_HEIGHT &&
        state.paddle1Y + PADDLE_HEIGHT >= state.ballY &&
        state.paddle1X <= state.ballX + BALL_WIDTH &&
        state.paddle1X + PADDLE_WIDTH >= state.ballX
    ) {
        state.ballDx = Math.abs(state.ballDx);
    } else if (
        state.paddle2Y <= state.ballY + BALL_HEIGHT &&
        state.paddle2Y + PADDLE_HEIGHT >= state.ballY &&
        state.paddle2X <= state.ballX + BALL_WIDTH &&
        state.paddle2X + PADDLE_WIDTH >= state.ballX
    ) {
        state.ballDx = -Math.abs(state.ballDx);
    }

    // Update ball position
    state.ballX += state.ballDx / 1000;
    state.ballY += state.ballDy / 1000;

    // FIX ME: Take into account how much they overlap to determine ball's new position. If they overlap a little, then the ball should end up closer to the paddle. If they overlap a lot, then the ball should end up farther from the paddle.
    // Reverse dy of ball at boundary.
    if (state.ballY < 0) {
        state.ballDy = Math.abs(state.ballDy);
    } else if (state.ballY + BALL_HEIGHT >= LEVEL_HEIGHT) {
        state.ballDy = -Math.abs(state.ballDy);
    }

    // FIX ME: Take into account how much they overlap to determine ball's new position. If they overlap a little, then the ball should end up closer to the paddle. If they overlap a lot, then the ball should end up farther from the paddle.
    // Reverse dx of ball at boundary.
    // The game should also end, but this is handy for sanity and if a developer
    // is debugging and wants to disable game end.
    if (state.ballX <= 0) {
        state.ballDx = Math.abs(state.ballDx);
    } else if (state.ballX + BALL_WIDTH >= LEVEL_WIDTH) {
        state.ballDx = -Math.abs(state.ballDx);
    }

    if (state.ballX <= 0 || state.ballX + BALL_WIDTH >= LEVEL_WIDTH) {
        // FIX ME: This is not quite right. If the other player was about to lose but then at the last moment they start moving or stop moving their paddle or change the direction of their paddle and don't lose, then when the update comes from the other client that that happened and those events are replayed, the game should continue running, but this may have already ended it, depending on timing.
        // FIX ME
        endGame(context);
        return;
    }
}

function endGame(context) {
    context.ended = true;

    context.socket.close(1000);

    // Show game ended message
    document.querySelector('.game-ended').style.display = '';

    // Show new game instructions
    document.querySelector('.new-game').style.display = '';

    for (const intervalHandle of context.intervalHandles) {
        clearInterval(intervalHandle);
    }
}
