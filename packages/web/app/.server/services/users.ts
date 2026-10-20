import type { CognitoUserID, UserID } from "@tasan/common/id";
import { getLogger } from "@tasan/common/logging";
import {
  ensureCognitoUser,
  putUser,
  updateUserSettings,
  type UserSettings,
} from "@tasan/data";

import { logAction } from "./logging";

export const provisionAuthenticatedUser = async (input: {
  cognitoID: CognitoUserID;
  email: string;
  name: string;
}) => {
  return logAction("user.provision", {}, async () => {
    const { userID } = await ensureCognitoUser({ cognitoID: input.cognitoID });
    getLogger().appendKeys({ userId: userID });
    await putUser({ id: userID, email: input.email, name: input.name });
    return { userID };
  });
};

export const saveUserSettings = (userID: UserID, settings: UserSettings) =>
  logAction("user.settings.update", { userId: userID }, () =>
    updateUserSettings(userID, settings),
  );
