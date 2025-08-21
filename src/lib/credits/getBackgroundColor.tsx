import { getRandomBackgroundColor } from "./getRandomBackgroundColor";

export const getBackgroundColor = (rank: number) => {
  if (rank === 1)
    return "bg-gradient-to-r from-yellow-50 to-amber-50 border-amber-200";
  if (rank <= 10) return getRandomBackgroundColor(rank - 1); // Use 0-9 index for colors
  return "bg-white border-gray-200";
};
