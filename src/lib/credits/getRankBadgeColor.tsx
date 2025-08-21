import { getRandomBadgeColor } from "./getRandomBadgeColor";

export const getRankBadgeColor = (rank: number) => {
  if (rank === 1) return "bg-yellow-500 text-yellow-900";
  if (rank <= 10) return getRandomBadgeColor(rank - 1); // Use 0-9 index for colors
  return "bg-gray-100 text-gray-700";
};
