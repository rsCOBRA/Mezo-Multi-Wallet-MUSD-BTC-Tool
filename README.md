# Mezo Multi-Wallet MUSD/BTC Tool

A simple Node.js CLI tool for managing and transferring **MUSD** and native **BTC** across multiple wallets on the Mezo network.

Built for the Mezo Buildathon (Access & Distribution track).

## Features
- Load multiple wallets from a local file
- Interactive wallet selection (single wallet or all)
- Send MUSD or native BTC
- Saved recipient addresses with labels
- Balance checks before sending
- Works on Mezo testnet (and mainnet with config change)

## Setup

1. Install dependencies:
   ```bash
   npm install ethers
