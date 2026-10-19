export function isAdultAccount(user) {
  const metadata = user?.user_metadata
  const age = Number(metadata?.age)
  return metadata?.adult_confirmed === true && Number.isInteger(age) && age >= 18 && age <= 120
}
