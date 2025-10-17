export type Address = `0x${string}`;

export interface DeadLiquidityUser {
  id: string;
  currentATokenBalance: string;
  scaledATokenBalance: string;
  lastUpdateTimestamp: string;
  user: {
    id: Address;
    reserves: { id: string }[];
    variableDebtReserves: { id: string }[];
    recentSupplies: { id: string }[];
    recentWithdrawals: { id: string }[];
    recentBorrows: { id: string }[];
    recentRepays: { id: string }[];
    historicalTokenSupplies: { id: string; timestamp: string }[];
    historicalBorrows: { id: string; timestamp: string; amount: string; reserve: { symbol: string } }[];
    historicalRepays: { id: string; timestamp: string; amount: string; reserve: { symbol: string } }[];
  };
  reserve: {
    id: string;
    symbol: string;
    decimals: number;
    underlyingAsset: Address;
    liquidityIndex: string;
    pool: { id: string };
  };
}

export interface DeadLiquidityResponse {
  userReserves: DeadLiquidityUser[];
}

export interface HistoricalBalanceResponse {
  userReserves: {
    id: string;
    scaledATokenBalance: string;
    reserve: {
      liquidityIndex: string;
      decimals: number;
    };
    historicalBalance: {
      timestamp: string;
      scaledATokenBalance: string;
      index: string;
    }[];
  }[];
}

export interface ProcessedUser {
  address: string;
  currentBalance: bigint;
  historicalBalance: bigint;
  yieldEarned: bigint;
  yieldPercentage: number;
  decimals: number;
  lastUpdateTimestamp: number;
  historicalTimestamp: number;
  isDead: boolean;
  userReserveId: string;
  tokenSymbol: string;
}