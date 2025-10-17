import { gql } from "graphql-request";

/**
 * Find users who:
 * 1. Currently have tokens supplied (currentATokenBalance > 0)
 * 2. Have had ZERO activity since cutoff (no supplies, withdrawals, borrows, repays of ANY asset)
 * 3. Had supply activity before cutoff (proving they deposited before 2 years ago)
 */
export const deadLiquidityUsersQuery = gql`
  query getDeadLiquidityUsers($tokenAddress: Bytes!, $cutoff: Int!, $first: Int!, $skip: Int!) {
    userReserves(
      where: {
        # Must currently have token supplied
        currentATokenBalance_gt: "0"
        reserve_: { underlyingAsset: $tokenAddress }
      }
      orderBy: currentATokenBalance
      orderDirection: desc
      first: $first
      skip: $skip
    ) {
      id
      currentATokenBalance
      scaledATokenBalance
      lastUpdateTimestamp
      user {
        id
        # Check current debt levels (should be zero)
        reserves(where: { 
          currentStableDebt_gt: "0" 
        }) {
          id
        }
        variableDebtReserves: reserves(where: { 
          currentVariableDebt_gt: "0" 
        }) {
          id
        }
        # Check for ANY activity since cutoff (MUST be empty for dead liquidity)
        recentSupplies: supplyHistory(
          where: { timestamp_gte: $cutoff }
          first: 1
        ) {
          id
        }
        recentWithdrawals: redeemUnderlyingHistory(
          where: { timestamp_gte: $cutoff }
          first: 1
        ) {
          id
        }
        recentBorrows: borrowHistory(
          where: { timestamp_gte: $cutoff }
          first: 1
        ) {
          id
        }
        recentRepays: repayHistory(
          where: { timestamp_gte: $cutoff }
          first: 1
        ) {
          id
        }
        # Check they had token supply activity BEFORE cutoff (proves they deposited before 2 years ago)
        historicalTokenSupplies: supplyHistory(
          where: { 
            timestamp_lt: $cutoff
            reserve_: { underlyingAsset: $tokenAddress }
          }
          first: 1
        ) {
          id
          timestamp
        }
        # Check for any borrow activity BEFORE cutoff (to verify no open borrows at cutoff)
        historicalBorrows: borrowHistory(
          where: { timestamp_lt: $cutoff }
          orderBy: timestamp
          orderDirection: desc
          first: 10
        ) {
          id
          timestamp
          amount
          reserve { symbol }
        }
        # Check for any repay activity BEFORE cutoff
        historicalRepays: repayHistory(
          where: { timestamp_lt: $cutoff }
          orderBy: timestamp
          orderDirection: desc
          first: 10
        ) {
          id
          timestamp
          amount
          reserve { symbol }
        }
      }
      reserve {
        id
        symbol
        decimals
        underlyingAsset
        liquidityIndex
        pool { id }
      }
    }
  }
`;

export const userReservesHistoryQuery = gql`
  query getUserReservesHistory($userReserveIds: [String!]!, $cutoff: Int!) {
    userReserves(where: { id_in: $userReserveIds }) {
      id
      # Current scaled balance and reserve info
      scaledATokenBalance
      reserve {
        liquidityIndex
        decimals
      }
      # Historical balance at cutoff
      historicalBalance: aTokenBalanceHistory(
        where: { 
          timestamp_lte: $cutoff 
        }
        orderBy: timestamp
        orderDirection: desc
        first: 1
      ) {
        timestamp
        scaledATokenBalance
        index
      }
    }
  }
`;