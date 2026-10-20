// Keep the stored "none" value compatible with existing tasks and saved views.
export const priorityOptions = ["urgent", "high", "medium", "low", "none"];
export const defaultPriority = "medium";
export const priorityLabels = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "Lowest",
};
export const priorityLabel = (value) => priorityLabels[value] || value || "";
