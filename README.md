# Aave V3 Dead Liquidity Analyzer

A tool to identify and analyze "dead liquidity" in Aave V3 - user deposits that have been inactive for a certain period of time, but continue earning yield.

## What is Dead Liquidity?

Dead liquidity refers to cryptocurrency deposits in Aave that meet all of these criteria:
- **Currently have tokens supplied** (aToken balance > 0)
- **Zero activity for a configurable number of seconds (see below)** (no supplies, withdrawals, borrows, or repays of ANY asset)
- **Had supply activity before the cutoff** (proving they deposited before becoming inactive)
- **No current debt** (no outstanding borrows)
- **No open borrows at cutoff date** (were debt-free when they became inactive)

These positions continue earning yield through Aave's interest-bearing aTokens, even though the users have ostensibly abandoned them.

## Installation

```bash
npm install
```

## Configuration

1. Copy the environment file:
```bash
cp .env.example .env
```

2. Add your Dune API key to `.env`:
```bash
DUNE_API_KEY=your_dune_api_key_here
```

## Usage

Run the analyzer for all supported tokens:

```bash
npm start
```

## Output

Each CSV file contains the following columns:

| Column | Description |
|--------|-------------|
| User Address | Ethereum address of the user |
| Current {TOKEN} Balance | Current aToken balance (with earned yield) |
| {CUTOFF_DATE} {TOKEN} Balance | Token balance at the cutoff date (2 years ago) |
| Exact Yield Earned | Precise amount of yield earned over the inactive period |
| Yield % | Percentage yield earned |
| Years Inactive | How many years the position has been inactive |
| Last Interaction | Date of the user's last activity |


## Configuration

To modify the token list, edit the `TOKEN_MAP` in `src/index.ts`:
```typescript
const TOKEN_MAP = new Map([
  ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "USDC"],
  ["0xdac17f958d2ee523a2206206994597c13d831ec7", "USDT"],
  ["0x6b175474e89094c44da98b954eedeac495271d0f", "DAI"]
]);
```

To modify the amount of idle time elapsed to be considering inactive, edit the `IDLE_SECONDS` in `src/index.ts`:
```typescript
// 1 Year in seconds
const IDLE_SECONDS = 1 * 365 * 24 * 60 * 60;
```