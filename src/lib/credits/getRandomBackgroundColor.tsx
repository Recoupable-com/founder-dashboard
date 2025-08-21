export const getRandomBackgroundColor = (seed: number) => {
  const colors = [
    "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200",
    "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200",
    "bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200",
    "bg-gradient-to-r from-pink-50 to-rose-50 border-pink-200",
    "bg-gradient-to-r from-cyan-50 to-teal-50 border-cyan-200",
    "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200",
    "bg-gradient-to-r from-lime-50 to-green-50 border-lime-200",
    "bg-gradient-to-r from-red-50 to-pink-50 border-red-200",
    "bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200",
    "bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200",
  ];
  return colors[seed % colors.length];
};
