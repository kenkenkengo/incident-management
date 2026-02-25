export const signIn = async (email: string, password: string) => {
  const response = await fetch(`/api/auth/signin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  return response.json();
}

export const refreshTokens = async (refreshToken: string) => {
  const response = await fetch(`/api/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });
  return response.json();
}
