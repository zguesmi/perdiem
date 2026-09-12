- print tools of purchaser and supplier agents at boot.
- make their logs good.
- print more logs to see failure cause
- check the payout cap policy and make it fixed.
- add circle and privy skills to agents.

Deploy:

- ssh vps
- git clone <repo> && cd sealedesk
- scp/paste .env.localhost # from your machine, edited per item 1
- docker compose up --build -d
