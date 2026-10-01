import type { CognitoUserID } from "@tasan/common/id";
import { ensureCognitoUser, putUser } from "@tasan/data";

export const provisionAuthenticatedUser = async (input: {
  cognitoID: CognitoUserID;
  email: string;
  name: string;
}) => {
  const { userID } = await ensureCognitoUser({ cognitoID: input.cognitoID });
  await putUser({ id: userID, email: input.email, name: input.name });
  return { userID };
};
