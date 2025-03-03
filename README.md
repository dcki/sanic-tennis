# Run

Run: `sanic server`

("server" refers to server.py.)

Run on specific port: `sanic -p 8001 server`


# Ideas

- Maybe use NAT hole punching to make clients communicate directly. Then the server would just serve files and match-make, and would no longer be responsible for proxying game data between clients.
    - But it sounds like this would be unreliable without sometimes relying on user intervention to modify their router configuration and/or falling back to the server proxying game data.
        - https://stackoverflow.com/questions/23176800/whats-so-hard-about-p2p-hole-punching


# Install on EC2 instance

To do: Automate.

```
ssh -i ~/Downloads/pong.pem ec2-user@1.2.3.4

mkdir pong
cd pong

curl https://pyenv.run | bash
```

Use `vi` to add this to `.bashrc`:

```
export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
```

Continue:

```
exit  # Prepare to run the modified .bashrc and prepare to run scp

scp -i ~/Downloads/pong2.pem * ec2-user@1.2.3.4:/home/ec2-user/pong/

ssh -i ~/Downloads/pong.pem ec2-user@1.2.3.4

sudo yum install gcc make patch zlib-devel bzip2 bzip2-devel readline-devel sqlite sqlite-devel openssl-devel tk-devel libffi-devel xz-devel

mkdir tmp
TMPDIR=~/tmp pyenv install -v 3.12.5
rm -r ~/tmp

cd pong
pyenv shell 3.12.5
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
sudo su
. .venv/bin/activate
sanic -H 0.0.0.0 -p 80 server &
# (Press enter to re-print shell prompt)
exit
exit
```

Update and restart:

```
scp -i ~/Downloads/pong2.pem * ec2-user@1.2.3.4:/home/ec2-user/pong/

ssh -i ~/Downloads/pong.pem ec2-user@1.2.3.4

cd pong
. .venv/bin/activate
pip install -r requirements.txt
sudo su
. .venv/bin/activate
killall -i sanic
sanic -H 0.0.0.0 -p 80 server &
# (Press enter to re-print shell prompt)
exit
exit
```
