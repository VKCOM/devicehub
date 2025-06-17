import { test as teardown } from '@playwright/test';
import { deleteAllAdminsTokens } from '../helpers/tokensHelper'

teardown('cleaning up', async ({ }) => {
    await deleteAllAdminsTokens()
});
