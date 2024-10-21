var socket;

function reset() {
    if (socket) {
        socket.close();

        // TODO: Will event handlers added to old `socket` really be removed by
        //       garbage collection? (Strange bugs would occur if event handlers
        //       for the old socket continued to be called.)
    }

    socket = new WebSocket('/ws');
    socket.addEventListener('open', ev => {
        log('WebSocket opened: ' + JSON.stringify(ev), 'info');

        socket.send(crypto.randomUUID());
    });
    socket.addEventListener('close', ev => {
        log('WebSocket closed: ' + JSON.stringify([ev.code, ev.reason, ev.wasClean]), ev.wasClean ? 'info' : 'error');

        // TODO: Can cause clients to retry constantly because "close" occurs
        //       after a failed attempt to connect, and reset() attempts to
        //       connect again. How severe is this problem for a user, server,
        //       or maintainer?
        reset();
    });
    socket.addEventListener('error', ev => {
        log('Error: ' + JSON.stringify(ev), 'error');
    });
    socket.addEventListener('message', ev => {
        if (typeof ev.data !== 'string') {
            log(`Error: Expected message data to be a string, but is ${typeof ev}`, 'error');

            // Try anyway.
            // TODO: What happens if `+` is used with string and ArrayBuffer, or string and Blob?
            //       Because those are the other possible types:
            //       https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/message_event
            log('Received message: ' + ev.data, 'info')

            return;
        }

        log('Received message: ' + ev.data, 'info')
    });
}

function log(message, messageType) {
    if (true) {
        const div = document.createElement('div');
        div.innerText = message;
        document.body.append(div);
    } else {
        switch (messageType) {
            case 'info':
                console.log(message);
                break;
            case 'error':
                console.error(message);
                break;
            default:
                throw new Error(`Expected messageType to be "info" or "error" but is ${messageType}. Message: ${message}`);
        }
    }
}
