# Don't forget the oatmeal

A simple grocery list application built with Preact, TypeScript, Vite, and Cloudflare Workers.

You can create a list by visiting a given hash: https://lucamasters.com/grocery/#your-list-name
It will be saved to Cloudflare Durable Objects.

The "Standard items" list will be empty by default. You can create a second list, https://lucamasters.com/grocery/#your-list-name-options and populate it with items you frequently purchase, and that will then populate the Standard items section of your main list.

Typically, after a shopping trip, I'll use "Prune Purchases" to clear out anything I bought (hopefully everything!) -- the "Remove Items" button will put you in a mode where you can select items to delete individually, but I find that's rarely needed.

This is not originally vibe coded, but was my first "almost vibe coded" project, and has since had a lot of vibe coding done to it. (Prior to this, I mostly used Copilot autocompletion and the occasional "write me a script".)

# Run locally
* nvm use
* nvm install
* make dev

# Deploy

* make deploy (run `cf auth login` once first)
