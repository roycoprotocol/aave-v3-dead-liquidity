import { fetchDeadLiquidityUsers, processUsers, generateCSV } from "./helpers.js";
import { writeFileSync } from "fs";
import { config } from "dotenv";

// Load environment variables
config();

// Configuration
const DUNE_API_KEY = process.env.DUNE_API_KEY;
const SUBGRAPH_URL = `https://gateway.thegraph.com/api/${DUNE_API_KEY}/subgraphs/id/Cd2gEDVeqnjBn1hSeqFMitw8Q1iiyV9FYUZkLNRcL87g`;
const IDLE_SECONDS = 2 * 365 * 24 * 60 * 60;
const TIME_IDLE_SECONDS_AGO = Math.floor(Date.now() / 1000) - IDLE_SECONDS;

// Token configuration map
const TOKEN_MAP = new Map([
    ["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "USDC"], // Mainnet USDC
    ["0xdac17f958d2ee523a2206206994597c13d831ec7", "USDT"], // Mainnet USDT  
    ["0x6b175474e89094c44da98b954eedeac495271d0f", "DAI"]   // Mainnet DAI
]);

async function main() {
    try {
        console.log("Starting multi-token analysis...");
        console.log("Cutoff date:", new Date(TIME_IDLE_SECONDS_AGO * 1000).toISOString());
        console.log("Analyzing tokens:", Array.from(TOKEN_MAP.values()).join(", "));

        const allResults = new Map();

        // Create output folder based on cutoff date
        const cutoffDate = new Date(TIME_IDLE_SECONDS_AGO * 1000);
        const month = (cutoffDate.getMonth() + 1).toString().padStart(2, '0');
        const day = cutoffDate.getDate().toString().padStart(2, '0');
        const year = cutoffDate.getFullYear().toString().slice(-2);
        const folderName = `idle-since-${month}-${day}-${year}`;

        // Import fs/promises for mkdir
        const { mkdir } = await import('fs/promises');

        // Create output directory
        try {
            await mkdir(folderName, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }

        // Process each token
        for (const [tokenAddress, tokenSymbol] of TOKEN_MAP) {
            console.log(`\n🔍 Analyzing ${tokenSymbol} (${tokenAddress})...`);

            // Fetch all potential dead liquidity users for this token
            console.log(`Fetching ${tokenSymbol} users...`);
            const rawUsers = await fetchDeadLiquidityUsers(
                SUBGRAPH_URL,
                tokenAddress,
                tokenSymbol,
                TIME_IDLE_SECONDS_AGO
            );
            console.log(`Found ${rawUsers.length} potential ${tokenSymbol} users`);

            // Process and filter for truly dead liquidity
            console.log(`Processing ${tokenSymbol} users...`);
            const deadUsers = await processUsers(SUBGRAPH_URL, rawUsers, tokenSymbol, TIME_IDLE_SECONDS_AGO);
            console.log(`Found ${deadUsers.length} dead liquidity ${tokenSymbol} users`);

            // Generate CSV for this token
            const csv = generateCSV(deadUsers, tokenSymbol, TIME_IDLE_SECONDS_AGO);

            // Save to file in the time-based folder
            const filename = `${folderName}/aave-dead-liquidity-${tokenSymbol.toLowerCase()}.csv`;
            writeFileSync(filename, csv);
            console.log(`✅ ${tokenSymbol} CSV saved to: ${filename}`);

            allResults.set(tokenSymbol, deadUsers);
        }

        // Show summary
        const totalUsers = Array.from(allResults.values()).reduce((sum, users) => sum + users.length, 0);
        console.log(`\n📊 Total dead liquidity users across all tokens: ${totalUsers}`);

        console.log("\n📈 Breakdown by token:");
        for (const [symbol, users] of allResults) {
            console.log(`  ${symbol}: ${users.length} users`);
        }
    } catch (error) {
        console.error("Error:", error);
        console.error("Stack:", error instanceof Error ? error.stack : "No stack trace");
        process.exit(1);
    }
}

main();