export const getRandomBadgeColor = (seed: number) => {
  const badgeColors = [
    "bg-blue-500 text-white",
    "bg-green-500 text-white",
    "bg-purple-500 text-white",
    "bg-pink-500 text-white",
    "bg-cyan-500 text-white",
    "bg-orange-500 text-white",
    "bg-lime-500 text-white",
    "bg-red-500 text-white",
    "bg-indigo-500 text-white",
    "bg-emerald-500 text-white",
  ];
  return badgeColors[seed % badgeColors.length];
};
