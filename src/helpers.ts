import { request } from "graphql-request";
import { deadLiquidityUsersQuery, userReservesHistoryQuery } from "./queries.js";
import type { DeadLiquidityUser, DeadLiquidityResponse, ProcessedUser, HistoricalBalanceResponse } from "./types.js";

// Helper function to check if user had no open borrows at the cutoff date
const checkNoOpenBorrowsAtCutoff = (userData: DeadLiquidityUser['user'], cutoff: number): boolean => {
  // Get all borrows and repays before cutoff, grouped by asset
  const borrowsByAsset = new Map<string, { borrows: number; repays: number }>();
  
  // Process historical borrows
  for (const borrow of userData.historicalBorrows) {
    const timestamp = parseInt(borrow.timestamp, 10);
    if (timestamp < cutoff) {
      const asset = borrow.reserve.symbol;
      if (!borrowsByAsset.has(asset)) {
        borrowsByAsset.set(asset, { borrows: 0, repays: 0 });
      }
      borrowsByAsset.get(asset)!.borrows += parseFloat(borrow.amount);
    }
  }
  
  // Process historical repays
  for (const repay of userData.historicalRepays) {
    const timestamp = parseInt(repay.timestamp, 10);
    if (timestamp < cutoff) {
      const asset = repay.reserve.symbol;
      if (!borrowsByAsset.has(asset)) {
        borrowsByAsset.set(asset, { borrows: 0, repays: 0 });
      }
      borrowsByAsset.get(asset)!.repays += parseFloat(repay.amount);
    }
  }
  
  // Check if any asset had outstanding debt at cutoff
  for (const [asset, { borrows, repays }] of borrowsByAsset) {
    const outstandingDebt = borrows - repays;
    if (outstandingDebt > 0.01) { // Small threshold to account for rounding
      return false; // Had open borrows at cutoff
    }
  }
  
  return true; // No open borrows at cutoff
};

export const fetchDeadLiquidityUsers = async (
  subgraphUrl: string,
  tokenAddress: string,
  tokenSymbol: string,
  cutoff: number,
  pageSize: number = 1000
): Promise<DeadLiquidityUser[]> => {
  const allUsers: DeadLiquidityUser[] = [];
  let skip = 0;

  while (true) {
    const response = await request<DeadLiquidityResponse>(
      subgraphUrl,
      deadLiquidityUsersQuery,
      {
        tokenAddress: tokenAddress,
        cutoff,
        first: pageSize,
        skip,
      }
    );

    const users = response.userReserves || [];
    if (users.length === 0) break;

    allUsers.push(...users);
    skip += users.length;
  }

  return allUsers;
};

const fetchCurrentAndHistoricalBalances = async (
  subgraphUrl: string,
  userReserveIds: string[],
  cutoff: number
): Promise<Map<string, { current: bigint; historical: bigint }>> => {
  const balanceMap = new Map<string, { current: bigint; historical: bigint }>();
  
  // Process in batches to avoid URL length limits
  const batchSize = 50;
  for (let i = 0; i < userReserveIds.length; i += batchSize) {
    const batch = userReserveIds.slice(i, i + batchSize);
    
    try {
      const response = await request<HistoricalBalanceResponse>(
        subgraphUrl,
        userReservesHistoryQuery,
        {
          userReserveIds: batch,
          cutoff,
        }
      );

      for (const userReserve of response.userReserves) {
        const scaledBalance = BigInt(userReserve.scaledATokenBalance);
        const currentLiquidityIndex = BigInt(userReserve.reserve.liquidityIndex);
        
        // Calculate current balance: scaledBalance * currentLiquidityIndex / RAY
        const RAY = BigInt("1000000000000000000000000000"); // 1e27
        const currentBalance = (scaledBalance * currentLiquidityIndex) / RAY;
        
        if (userReserve.historicalBalance && userReserve.historicalBalance.length > 0) {
          const historicalRecord = userReserve.historicalBalance[0]!;
          const historicalScaledBalance = BigInt(historicalRecord.scaledATokenBalance);
          const historicalIndex = BigInt(historicalRecord.index);
          
          // Calculate historical balance: historicalScaledBalance * historicalIndex / RAY
          const historicalBalance = (historicalScaledBalance * historicalIndex) / RAY;
          
          
          balanceMap.set(userReserve.id, {
            current: currentBalance,
            historical: historicalBalance
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching balances for batch:`, error);
    }
  }
  
  return balanceMap;
};

export const processUsers = async (
  subgraphUrl: string,
  users: DeadLiquidityUser[], 
  tokenSymbol: string,
  cutoff: number
): Promise<ProcessedUser[]> => {
  const processedUsers: ProcessedUser[] = [];

  for (const user of users) {
    // Check if user is truly dead (no activity since cutoff)
    const hasRecentActivity = 
      user.user.recentSupplies.length > 0 ||
      user.user.recentWithdrawals.length > 0 ||
      user.user.recentBorrows.length > 0 ||
      user.user.recentRepays.length > 0;

    // Check if user has any current debt
    const hasCurrentDebt = 
      user.user.reserves.length > 0 ||
      user.user.variableDebtReserves.length > 0;

    // Check if user had token deposits before cutoff (proves they deposited before 2 years ago)
    const hadHistoricalTokenSupply = user.user.historicalTokenSupplies.length > 0;

    // Additional check: ensure their token position itself hasn't been updated recently
    const tokenPositionOld = parseInt(user.lastUpdateTimestamp, 10) < cutoff;
    
    // Check if user had no open borrows at the cutoff date (2 years ago)
    const hadNoOpenBorrowsAtCutoff = checkNoOpenBorrowsAtCutoff(user.user, cutoff);
    
    // Only include users who are truly dead with no debt AND had historical token supply AND old token position AND no open borrows at cutoff
    if (!hasRecentActivity && !hasCurrentDebt && hadHistoricalTokenSupply && tokenPositionOld && hadNoOpenBorrowsAtCutoff) {
      processedUsers.push({
        address: user.user.id,
        currentBalance: BigInt(user.currentATokenBalance),
        historicalBalance: 0n, // Will be filled in later
        yieldEarned: 0n, // Will be calculated later
        yieldPercentage: 0, // Will be calculated later
        decimals: user.reserve.decimals,
        lastUpdateTimestamp: parseInt(user.lastUpdateTimestamp, 10),
        historicalTimestamp: parseInt(user.lastUpdateTimestamp, 10), // Use actual last activity date
        isDead: true,
        userReserveId: user.id, // Add this for historical balance lookup
        tokenSymbol: tokenSymbol
      });
    }
  }

  // Now fetch current and historical balances for all eligible users in batches
  const userReserveIds = processedUsers.map(user => user.userReserveId);
  const balances = await fetchCurrentAndHistoricalBalances(subgraphUrl, userReserveIds, cutoff);
  
  for (const user of processedUsers) {
    const userBalances = balances.get(user.userReserveId);
    
    if (userBalances && userBalances.historical > 0n) {
      // Use the ACTUAL current balance from the separate query, not the potentially outdated one
      user.currentBalance = userBalances.current;
      user.historicalBalance = userBalances.historical;
      user.yieldEarned = userBalances.current - userBalances.historical;
      user.yieldPercentage = Number((user.yieldEarned * 10000n) / userBalances.historical) / 100;
      // Keep the actual last activity timestamp (already set above)
    }
  }

  // Filter out users without valid historical balance data and with negative yield
  const validUsers = processedUsers.filter(user => 
    user.historicalBalance > 0n && user.yieldEarned >= 0n
  );

  // Sort by current balance descending
  return validUsers.sort((a, b) => Number(b.currentBalance - a.currentBalance));
};

export const toHuman = (amount: bigint, decimals: number): string => {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = amount % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 6);
  return `${whole.toString()}.${fracStr}`.replace(/\.$/, "");
};

export const unixToISO = (timestamp: number): string => {
  return new Date(timestamp * 1000).toISOString();
};

export const generateCSV = (users: ProcessedUser[], tokenSymbol?: string, cutoffDate?: number): string => {
  // Headers with exact historical data
  const token = tokenSymbol || users[0]?.tokenSymbol || "TOKEN";
  const cutoffDateStr = cutoffDate ? new Date(cutoffDate * 1000).toISOString().split('T')[0] : "2022-10-17";
  const headers = [
    "User Address",
    `Current ${token} Balance`, 
    `${cutoffDateStr} ${token} Balance`,
    "Exact Yield Earned",
    "Yield %",
    "Years Inactive",
    "Historical Date"
  ].join(",");

  // Calculate years inactive for each user
  const currentTime = Math.floor(Date.now() / 1000);
  
  const rows = users.map(user => {
    const yearsInactive = ((currentTime - user.lastUpdateTimestamp) / (365 * 24 * 60 * 60)).toFixed(1);
    
    return [
      user.address,
      toHuman(user.currentBalance, user.decimals),
      toHuman(user.historicalBalance, user.decimals),
      toHuman(user.yieldEarned, user.decimals),
      user.yieldPercentage.toFixed(2),
      yearsInactive,
      unixToISO(user.historicalTimestamp).split('T')[0]
    ].join(",");
  });

  // Calculate totals for last row
  const totalCurrentBalance = users.reduce((sum, u) => sum + u.currentBalance, 0n);
  const totalHistoricalBalance = users.reduce((sum, u) => sum + u.historicalBalance, 0n);
  const totalYield = users.reduce((sum, u) => sum + u.yieldEarned, 0n);
  const avgYieldPercentage = totalHistoricalBalance > 0n 
    ? Number((totalYield * 10000n) / totalHistoricalBalance) / 100
    : 0;

  const decimals = users[0]?.decimals || 6;
  
  // Totals row
  const totalsRow = [
    `TOTALS (${users.length} users)`,
    toHuman(totalCurrentBalance, decimals),
    toHuman(totalHistoricalBalance, decimals), 
    toHuman(totalYield, decimals),
    avgYieldPercentage.toFixed(2),
    "",
    ""
  ].join(",");

  return [headers, ...rows, totalsRow].join("\n");
};