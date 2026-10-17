export function nextDate(value, rule) {
  const date = new Date(
    `${value || new Date().toISOString().slice(0, 10)}T12:00:00Z`,
  );
  if (rule.unit === "month") {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + rule.interval);
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  } else
    date.setUTCDate(
      date.getUTCDate() + rule.interval * (rule.unit === "week" ? 7 : 1),
    );
  return date.toISOString().slice(0, 10);
}
