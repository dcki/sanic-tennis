# Run

Run: `sanic server`

("server" refers to server.py.)

Run on specific port: `sanic -p 8001 server`


# Ideas

- Maybe use NAT hole punching to make clients communicate directly. Then the server would just serve files and match-make, and would no longer be responsible for proxying game data between clients.
    - But it sounds like this would be unreliable without sometimes relying on user intervention to modify their router configuration and/or falling back to the server proxying game data.
        - https://stackoverflow.com/questions/23176800/whats-so-hard-about-p2p-hole-punching
