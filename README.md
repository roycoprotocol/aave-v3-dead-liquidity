# Aave V3 Dead Liquidity Analyzer

A tool to identify and analyze "dead liquidity" in Aave V3 - user deposits that have been inactive for 2+ years but continue earning yield.

## What is Dead Liquidity?

Dead liquidity refers to cryptocurrency deposits in Aave that meet all of these criteria:
- **Currently have tokens supplied** (aToken balance > 0)
- **Zero activity for 2+ years** (no supplies, withdrawals, borrows, or repays of ANY asset)
- **Had supply activity before the cutoff** (proving they deposited before becoming inactive)
- **No current debt** (no outstanding borrows)
- **No open borrows at cutoff date** (were debt-free when they became inactive)

These positions continue earning yield through Aave's interest-bearing aTokens, even though the users have abandoned them.

## Supported Tokens

The analyzer currently supports:
- **USDC** (`0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`)
- **USDT** (`0xdac17f958d2ee523a2206206994597c13d831ec7`) 
- **DAI** (`0x6b175474e89094c44da98b954eedeac495271d0f`)

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

Or set the API key inline:
```bash
DUNE_API_KEY=your_key npm start
```

This will generate separate CSV files for each token:
- `aave-dead-liquidity-usdc.csv`
- `aave-dead-liquidity-usdt.csv`
- `aave-dead-liquidity-dai.csv`

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

## How It Works

### 1. Data Collection
- Queries Aave V3 subgraph for users with current token balances
- Filters for users with zero activity since the cutoff date
- Validates they had historical supply activity before becoming inactive

### 2. Yield Calculation
Uses precise aToken mechanics:
- **Current Balance** = `scaledBalance × currentLiquidityIndex ÷ RAY`
- **Historical Balance** = `historicalScaledBalance × historicalIndex ÷ RAY`
- **Yield Earned** = `Current Balance - Historical Balance`

Where `RAY = 1e27` (Aave's precision unit)

### 3. Validation
Ensures users are truly "dead" by checking:
- No recent activity across ALL assets
- No current debt positions
- No open borrows at the cutoff date
- Position hasn't been updated recently

## Configuration

To modify the token list, edit the `TOKEN_MAP` in `src/index.ts`:

```typescript
const TOKEN_MAP = new Map([
  ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "USDC"],
  ["0xdac17f958d2ee523a2206206994597c13d831ec7", "USDT"],
  ["0x6b175474e89094c44da98b954eedeac495271d0f", "DAI"]
]);
```

## Technical Details

### Architecture
- **TypeScript/Node.js** with ESM modules
- **GraphQL** queries to Aave V3 subgraph
- **BigInt arithmetic** for precise token calculations
- **Batch processing** for efficient API usage

### Key Files
- `src/index.ts` - Main entry point and token configuration
- `src/queries.ts` - GraphQL queries for subgraph data
- `src/helpers.ts` - Data processing and CSV generation logic
- `src/types.ts` - TypeScript type definitions

### Performance
- Batches GraphQL requests (50 users per batch) to minimize API calls
- Processes historical balance lookups efficiently
- Typical analysis completes in under 2 minutes per token

## Requirements

- Node.js 16+
- TypeScript
- Internet connection (for subgraph queries)

## Example Output

```
Starting multi-token analysis...
Cutoff date: 2022-10-17T14:30:45.000Z
Analyzing tokens: USDC, USDT, DAI

🔍 Analyzing USDC (0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48)...
Fetching USDC users...
Found 2847 potential USDC users
Processing USDC users...
Found 484 dead liquidity USDC users
✅ USDC CSV saved to: aave-dead-liquidity-usdc.csv

📊 Total dead liquidity users across all tokens: 1,247
📈 Breakdown by token:
  USDC: 484 users
  USDT: 312 users  
  DAI: 451 users
```

## Use Cases

- **Research**: Understanding user behavior in DeFi protocols
- **Analytics**: Quantifying abandoned capital in lending markets
- **Recovery**: Identifying unclaimed yield opportunities
- **Protocol Analysis**: Measuring true vs. apparent TVL

## License

MIT