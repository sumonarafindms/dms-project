# V16 Retailer Search & Opportunity

- Admin and Accounts now have global retailer search.
- Search supports retailer code/name, RSO, supervisor, route and category.
- Attention/Opportunity uses live monthly data only, no extra storage.
- SSO pending follows existing rule: SIM_SELLER=Y and monthly GA < 2.
- LSO pending follows existing rule: monthly C2S < 500 or transactions < 7.
- Retailer rows drill into existing detailed GA/C2C/C2S/OB views.
- No Prisma schema migration required.
