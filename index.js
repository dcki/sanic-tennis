// FIX ME: Put functions in meaningful sections or separate modules.

const PRINT_TRACE = false;

// FIX ME: Make smaller y values refer to visually lower areas of the game area and larger y values refer to visually higher areas, and make the rendering code translate those values into the values that the browser uses.
// NOTE: ACTION_BODY_MARGIN is duplicated in index.js and index.css.
const ACTION_BODY_MARGIN = 10;
// NOTE: BUTTON_MARGIN is duplicated in index.js and index.css.
const BUTTON_MARGIN = 10;
const LEVEL_WIDTH = 400;
const LEVEL_HEIGHT = 200;
const BALL_WIDTH = 10;
const BALL_HEIGHT = 10;
const PADDLE_WIDTH = 20;
const PADDLE_HEIGHT = 40;
const PADDLE_X_DISTANCE_FROM_SIDE = 20;
const INITIAL_BALL_X = 1;
const INITIAL_BALL_Y = 0;
const BALL_SPEED = 200;  // distance per second
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
const PARTICLES_PER_SECOND = 200;
const PARTICLE_LIFETIME = 1;
const PARTICLE_EXPIRATION_SPEED = 1;
const KEY_CODE_UP = 38;
const KEY_CODE_DOWN = 40;
const RELEVANT_KEY_CODES = [
    KEY_CODE_UP,
    KEY_CODE_DOWN,
];

// FIX ME
const PROPORTION_OF_ACTION_BODY_WIDTH_TAKEN_BY_LEVEL = 2/3;

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
    addMouseListeners(context);

    window.addEventListener('resize', () => {
        resetUi();
        if (context.playerId !== null) {
            updateCountdownUi(context.playerId);
        }
        updateUi(context);
    });
    resetUi();

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
        clockSyncData: [],
        // The number of milliseconds that the client clock is ahead of the
        // server clock. To get the current server time, subtract this from
        // Date.now(). (The server time is the canonical time, shared by all
        // players, for any game event.)
        timeOffset: null,
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
        particles: [],
        unusedParticleDomElements: [],
        lastParticleCreatedTime: null,
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
            time: getEventMilliseconds(ev, context),
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
            time: getEventMilliseconds(ev, context),
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

function addMouseListeners(context) {
    document.querySelector('.up-button').addEventListener('mousedown', makeMouseOrTouchHandler('keydown', KEY_CODE_UP, context), false);
    document.querySelector('.up-button').addEventListener('touchstart', makeMouseOrTouchHandler('keydown', KEY_CODE_UP, context), false);
    document.querySelector('.up-button').addEventListener('mouseup', makeMouseOrTouchHandler('keyup', KEY_CODE_UP, context), false);
    document.querySelector('.up-button').addEventListener('touchend', makeMouseOrTouchHandler('keyup', KEY_CODE_UP, context), false);

    document.querySelector('.down-button').addEventListener('mousedown', makeMouseOrTouchHandler('keydown', KEY_CODE_DOWN, context), false);
    document.querySelector('.down-button').addEventListener('touchstart', makeMouseOrTouchHandler('keydown', KEY_CODE_DOWN, context), false);
    document.querySelector('.down-button').addEventListener('mouseup', makeMouseOrTouchHandler('keyup', KEY_CODE_DOWN, context), false);
    document.querySelector('.down-button').addEventListener('touchend', makeMouseOrTouchHandler('keyup', KEY_CODE_DOWN, context), false);
}

function makeMouseOrTouchHandler(keyEventType, keyCode, context) {
    return ev => {
        ev.preventDefault();

        if (!context.started) {
            return;
        }

        // HACK: Generate a keydown event from this mousedown/touchstart event.
        const ev2 = {
            type: keyEventType,
            data: {
                key_code: keyCode,
            },
            time: getEventMilliseconds(ev, context),
            player_id: context.playerId,
        }
        context.events.push(ev2);
        context.unsentEvents.push(ev2);
        context.state = updateState(context.state, [ev2], context);
        if (context.state.ended) {
            return;
        }
    };
}

function resetUi() {
    const actionBodyWidth = window.innerWidth - (2 * ACTION_BODY_MARGIN);

    window.screenToGameRatio = (
        actionBodyWidth * PROPORTION_OF_ACTION_BODY_WIDTH_TAKEN_BY_LEVEL / LEVEL_WIDTH);

    const gameEl = document.querySelector('.game-field');
    const paddle1El = document.querySelector('.paddle-1');
    const paddle2El = document.querySelector('.paddle-2');
    const ballEl = document.querySelector('.ball');
    const upButtonEl = document.querySelector('.up-button');
    const downButtonEl = document.querySelector('.down-button');

    gameEl.style.width = (LEVEL_WIDTH * window.screenToGameRatio).toString() + 'px';
    gameEl.style.height = (LEVEL_HEIGHT * window.screenToGameRatio).toString() + 'px';

    paddle1El.style.width = (PADDLE_WIDTH * window.screenToGameRatio).toString() + 'px';
    paddle1El.style.height = (PADDLE_HEIGHT * window.screenToGameRatio).toString() + 'px';

    paddle2El.style.width = (PADDLE_WIDTH * window.screenToGameRatio).toString() + 'px';
    paddle2El.style.height = (PADDLE_HEIGHT * window.screenToGameRatio).toString() + 'px';

    ballEl.style.width = (BALL_WIDTH * window.screenToGameRatio).toString() + 'px';
    ballEl.style.height = (BALL_HEIGHT * window.screenToGameRatio).toString() + 'px';

    const buttonSideLength = (
        (LEVEL_HEIGHT * window.screenToGameRatio / 2)
        - 0.5  // for 1px border between buttons
        - BUTTON_MARGIN
    ).toString() + 'px';
    upButtonEl.style.width = buttonSideLength;
    upButtonEl.style.height = buttonSideLength;
    downButtonEl.style.width = buttonSideLength;
    downButtonEl.style.height = buttonSideLength;
}

function handleConnect(context, socket) {
    context.socket = socket;

    // Show waiting
    document.querySelector('.waiting').style.display = '';

    requestClockSync(context);
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
        // FIX ME: I think there is already a FIX ME somewhere else for this: Tell user that this is in progress.
        // FIX ME: It has not yet been proven that a lack of clock syncing has a significant impact on gameplay. (Or at least not documented. I forget what I observed...)
        case 'server_clock_sync':
            // Finish recording one clock sync.
            const lastIndex = context.clockSyncData.length - 1;
            context.clockSyncData[lastIndex]['responseReceivedTime'] = Date.now();
            context.clockSyncData[lastIndex]['serverTime'] = message.data.server_time;

            if (!message.data.last_clock_sync) {
                requestClockSync(context);
            } else {
                // Calculate context.timeOffset
                // 
                // It's assumed that averaging several clock syncs will result
                // in a more accurate timeOffset than just one clock sync.
                const timeOffsets = context.clockSyncData.map(clockSync => {
                    const rtt = clockSync.responseReceivedTime - clockSync.requestSentTime;
                    const clientTimeWhenServerProcessedRequest = clockSync.responseReceivedTime - rtt / 2;
                    // This is a value like context.timeOffset. See the comment
                    // in makeContext() on timeOffset.
                    const timeOffset = clientTimeWhenServerProcessedRequest - clockSync.serverTime;
                    return timeOffset;
                });
                context.timeOffset = (
                    timeOffsets.reduce((total, nextValue) => total + nextValue)  // sum
                    / timeOffsets.length
                );  // average

                context.socket.send(JSON.stringify({
                    type: 'client_ready_to_match',
                    data: {},
                }));
            }
            break;
        case 'server_matched':
            // Hide waiting
            document.querySelector('.waiting').style.display = 'none';

            // Show game
            document.querySelector('.game-field').style.display = '';

            // Show controls
            document.querySelector('.up-and-down-buttons').style.display = '';

            // FIX ME: Show "Loading..." and no subtitle, and then subtitle "Syncing clocks...", and then no subtitle, and then no "Loading..."

            // FIX ME: Use startTime (Remember it will typically be about 3 seconds in the future)
            // FIX ME: Use startTime
            // FIX ME: Use startTime
            // FIX ME: Use startTime
            // FIX ME: Use startTime
            // FIX ME: Use startTime
            const startTime = message.data.start_time;
            const countdownEl = document.querySelector('.countdown');
            const startingInterval1 = setInterval(() => {
                const now = eventNow(context);
                // FIX ME: countdownStartTime is no longer defined
                if (now < startTime - 3000) {
                    countdownEl.innerText = '3';
                    // FIX ME
                    console.log('3');
                } else if (now < startTime - 2000) {
                    countdownEl.innerText = '2';
                    // FIX ME
                    console.log('2');
                } else if (now < startTime - 1000) {
                    countdownEl.innerText = '1';
                    // FIX ME
                    console.log('1');
                } else {
                    // FIX ME
                    console.log('0 1');
                    clearInterval(startingInterval1);
                    const startingInterval2 = setInterval(() => {
                        // FIX ME
                        console.log('0 2');
                        const now = eventNow(context);
                        if (now >= startTime) {
                            // FIX ME
                            console.log('0 3');

                            countdownEl.innerText = '';
                            countdownEl.style.display = 'none';

                            // FIX ME:
                            // 
                            // The start time syncing stuff isn't working correctly yet. Players' games were *more* in sync before the "Ensure time stamps are used, not the times when the events are handled" commit.
                            // 
                            // Another way to do it:
                            // 
                            // Before game starts:
                            // 1. In client, remember current time and send message to server.
                            // 2. Server should respond with what the server thinks is the current time.
                            // 3. In client, remember what time it is when response is received.
                            // 4. Approximate round trip time to the server can be calculated from the 2 times that the client stored. Dividing RTT by 2 gives an approximation of time interval between when server sent the response and when it was received. Given that time interval (i), the current time (ct_client), and the time the server reported as the current time (ct_server), then a number (time_difference) can be calculated that is how far the client clock is ahead of the server clock: time_difference = ct_client - (ct_server + i). Any time a game event time (ev_time) should be computed, then ev_time = ct_client2 - time_difference.
                            // 5. By making multiple requests to the server for what time it is, and averaging the resulting time_differences, a more accurate time_difference can be computed.
                            // 6. I was going to say "By including server time in every response and continuously updating time_difference to consider the data from several recent requests, time_difference can account for changes in network conditions as the game progresses"
                            //    But I'm not saying that because what we'd really be updating is an estimate in differences between client and server clocks, and that's unlikely to change much or at all during the game. More data may be useful in general, but there isn't necessarily more value in data that comes in after the game starts vs before.
                            context.started = true;

                            initializeIntervals(context);

                            // Hide paddle hint
                            document.querySelector('.paddle-hint').style.display = 'none';

                            clearInterval(startingInterval2);
                        }
                    }, 1);
                }
            }, 10);

            context.playerId = message.data.player_id;

            updateCountdownUi(context.playerId);
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

function requestClockSync(context) {
    context.clockSyncData.push({
        requestSentTime: Date.now(),
        responseReceivedTime: null,
        serverTime: null,
    });
    context.socket.send(JSON.stringify({
        type: 'client_clock_sync',
        data: {},
    }));
}

function initializeIntervals(context) {
    context.intervalHandles.push(setInterval(() => {
        context.state = updateState(context.state, [], context);
        if (context.state.ended) {
            return;
        }
        updateParticlesState(context);
        updateUi(context);
    }, 20));
    context.intervalHandles.push(setInterval(() => {
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

function updateCountdownUi(playerId) {
    const countdownEl = document.querySelector('.countdown');
    countdownEl.style.fontSize = (50 * window.screenToGameRatio).toString() + 'px';

    const paddleHintEl = document.querySelector('.paddle-hint');
    paddleHintEl.innerText = `You are player ${playerId}`;
    const textWidth = 60;
    paddleHintEl.style.width = (textWidth * window.screenToGameRatio).toString() + 'px';
    paddleHintEl.style.fontSize = (16 * window.screenToGameRatio).toString() + 'px';
    switch (playerId) {
        case 1:
            paddleHintEl.style.left = ((INITIAL_PADDLE_1_X + PADDLE_WIDTH + 10) * window.screenToGameRatio).toString() + 'px';
            paddleHintEl.style.top = (INITIAL_PADDLE_1_Y * window.screenToGameRatio).toString() + 'px';
            break;
        case 2:
            paddleHintEl.style.left = ((INITIAL_PADDLE_2_X - 10 - textWidth) * window.screenToGameRatio).toString() + 'px';
            paddleHintEl.style.top = (INITIAL_PADDLE_2_Y * window.screenToGameRatio).toString() + 'px';
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

    paddle1El.style.left = (state.paddle1X * window.screenToGameRatio).toString() + 'px';
    paddle1El.style.top = (state.paddle1Y * window.screenToGameRatio).toString() + 'px';

    paddle2El.style.left = (state.paddle2X * window.screenToGameRatio).toString() + 'px';
    paddle2El.style.top = (state.paddle2Y * window.screenToGameRatio).toString() + 'px';

    ballEl.style.left = (state.ballX * window.screenToGameRatio).toString() + 'px';
    ballEl.style.top = (state.ballY * window.screenToGameRatio).toString() + 'px';

    for (const particle of context.particles) {
        particle.el.style.left = (particle.x * window.screenToGameRatio).toString() + 'px';
        particle.el.style.top = (particle.y * window.screenToGameRatio).toString() + 'px';
    }
}

// FIX ME: Tapping the up and down arrows can result in a paddle not being in the same position as observed by both players.
function updateState(state, events, context) {
    state = Object.assign({}, state);  // copy
    const now = eventNow(context);

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
    if (state.paddle1Y < 0) {
        state.paddle1Y = 0;
    } else if (state.paddle1Y + PADDLE_HEIGHT > LEVEL_HEIGHT) {
        state.paddle1Y = LEVEL_HEIGHT - PADDLE_HEIGHT;
    }

    state.paddle2Y += state.paddle2Dy;
    if (state.paddle2Y < 0) {
        state.paddle2Y = 0;
    } else if (state.paddle2Y + PADDLE_HEIGHT > LEVEL_HEIGHT) {
        state.paddle2Y = LEVEL_HEIGHT - PADDLE_HEIGHT;
    }

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
    // FIX ME
    console.log('state.ballX += state.ballDx / 1000;');
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

    // FIX ME: Update this comment. I think I fixed this by add playerId to the conditions.
    // FIX ME: This is not quite right. If the other player was about to lose but then at the last moment they start moving or stop moving their paddle or change the direction of their paddle and don't lose, then when the update comes from the other client that that happened and those events are replayed, the game should continue running, but this may have already ended it, depending on timing.
    if (
        (state.ballX <= 0 && context.playerId === 1) ||
        (state.ballX + BALL_WIDTH >= LEVEL_WIDTH && context.playerId === 2)
    ) {
        // FIX ME
        console.log('tick: endGame');
        endGame(context);
        return;
    }
}

function updateParticlesState(context) {
    // HACK: Update positions of particles in this function, which normally only
    //       uses positions that were already calculated. This function doesn't
    //       normally update state, for good reason... But these are just
    //       particles so the weird things that will happen due to this hack
    //       aren't as important. For now I'm just going to hack this, because I
    //       want to quickly see it mostly work.
    if (context.lastParticleCreatedTime === null || eventNow(context) - context.lastParticleCreatedTime > 1000 / PARTICLES_PER_SECOND) {
        let particleEl;
        if (context.unusedParticleDomElements.length > 0) {
            particleEl = context.unusedParticleDomElements.pop();
        } else {
            particleEl = document.createElement('div');
            particleEl.classList.add('particle');
            particleEl.style.backgroundColor = `rgb(${128 + Math.floor(Math.random() * 128)}, ${128 + Math.floor(Math.random() * 128)}, ${128 + Math.floor(Math.random() * 128)})`;
            const gameEl = document.querySelector('.game-field');
            gameEl.append(particleEl);
        }
        context.particles.push({
            el: particleEl,
            x: context.state.ballX + BALL_WIDTH / 2 + Math.random() * BALL_WIDTH - (BALL_WIDTH / 2),
            y: context.state.ballY + BALL_HEIGHT / 2 + Math.random() * BALL_HEIGHT - (BALL_HEIGHT / 2),
            dx: context.state.ballDx,
            dy: context.state.ballDy,
        });

        context.lastParticleCreatedTime = eventNow(context);
    }
    for (let i = context.particles.length - 1; i >= 0; i--) {
        const particle = context.particles[i];
        particle.x += particle.dx / 1000;
        particle.y += particle.dy / 1000;
        // FIX ME: PARTICLE_LIFETIME
        // FIX ME: HACK
        particle.dx *= 0.6;
        // FIX ME: HACK
        particle.dy *= 0.6;
        if (Math.sqrt(particle.dx*particle.dx + particle.dy*particle.dy) < PARTICLE_EXPIRATION_SPEED) {
            context.particles.splice(i, 1);
            context.unusedParticleDomElements.push(particle.el);
        }
    }
}

function endGame(context) {
    context.ended = true;

    context.socket.close(1000);

    // Show game ended message
    document.querySelector('.game-ended').style.display = '';

    // Show new game instructions
    document.querySelector('.new-game').style.display = '';

    // Hide waiting, in case server disconnected before game started.
    document.querySelector('.waiting').style.display = 'none';

    for (const intervalHandle of context.intervalHandles) {
        clearInterval(intervalHandle);
    }

    // FIX ME: Remove key handlers
    // FIX ME: Remove mouse handlers
}

function eventNow(context) {
    return getEventMilliseconds(new Event(''), context);
}

function getEventMilliseconds(ev, context) {
    // TODO: Try again to use ev.timestamp. The problem is that ev.timestamp is
    //       milliseconds since page load (performance.timeOrigin), and can't be
    //       compared directly to times produced by Date.now(). Worse,
    //       apparently performance.timeOrigin + ev.timestamp can be
    //       significantly different from Date.now(). See the notes at
    //       https://developer.mozilla.org/en-US/docs/Web/API/Performance/timeOrigin
    // Math.round(): In some browsers Event.timeStamp returns an integer and in
    // others it returns more precision. Round so that an integer is always
    // returned to be consistent across browsers, since these numbers are sent
    // to the other player's client.
    //return pageLoadTime + Math.round(ev.timeStamp) - context.timeOffset;

    // HACK: It seems like this could be some number of milliseconds after the
    //       actual event occurred, for example if the event occurred while a
    //       long running event handler function was running (to handle an
    //       earlier event), which would introduce a delay.
    return Date.now() - context.timeOffset;
}
