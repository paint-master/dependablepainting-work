# Dependable Painting Website

This repository contains the static website and Cloudflare Worker function used for Dependable Painting.

## Structure

- **Public/** – HTML pages and assets deployed to Cloudflare Pages
- **functions/** – Edge function for handling contact form submissions
- **wrangler.toml** – Cloudflare Pages configuration

## Development

1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
2. Set environment variables in `.env` (ignored in git) for the contact form function.
3. Run `wrangler pages dev Public` to preview the site locally.

## Deployment

Push changes to the `main` branch to trigger deployment through Cloudflare Pages.


