.PHONY: deploy dev build format lint

build:
	npm run build

dev:
	npx wrangler dev

deploy:
	npx wrangler deploy

format:
	oxfmt --config=/Users/luca/dotfiles/.oxfmtrc.json

lint:
	oxlint
