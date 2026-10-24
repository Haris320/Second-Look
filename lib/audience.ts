export const MIN_AGE = 18;
export const MAX_AGE = 120;
export type ReviewerGender = "women" | "men";
export function recommendedAges(age: number) {
  return { min: Math.max(MIN_AGE, age - 7), max: Math.min(MAX_AGE, age + 7) };
}
export function validAge(age: unknown): age is number {
  return (
    typeof age === "number" &&
    Number.isInteger(age) &&
    age >= MIN_AGE &&
    age <= MAX_AGE
  );
}
export function reviewerPreferenceError(input: {
  userAge: unknown;
  reviewerGender: unknown;
  reviewerMinAge: unknown;
  reviewerMaxAge: unknown;
}) {
  if (!validAge(input.userAge)) return "Enter your age (18 or older).";
  if (input.reviewerGender !== "women" && input.reviewerGender !== "men")
    return "Choose male or female reviewers.";
  if (!validAge(input.reviewerMinAge) || !validAge(input.reviewerMaxAge))
    return "Reviewer ages must be whole numbers between 18 and 120.";
  if (input.reviewerMinAge > input.reviewerMaxAge)
    return "The minimum reviewer age cannot be higher than the maximum.";
  return null;
}
export function audienceLabel(audience: string) {
  const match = /^(women|men)_(\d+)_(\d+)_us$/.exec(audience);
  if (!match) return audience;
  return `${match[1] === "women" ? "Female" : "Male"} reviewers, ${match[2]}–${match[3]} · United States`;
}
