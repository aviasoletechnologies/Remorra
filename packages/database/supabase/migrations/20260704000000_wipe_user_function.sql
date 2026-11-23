-- Create stored function for user data deletion
CREATE OR REPLACE FUNCTION public.wipe_user(user_id_param UUID)
RETURNS VOID AS $$
BEGIN
    -- 1. Delete all projects owned by the user (cascades to all project-scoped data)
    DELETE FROM "Project" WHERE "ownerId" = user_id_param;

    -- 2. Delete memberships for this user in other projects
    DELETE FROM "ProjectMembership" WHERE "userId" = user_id_param;

    -- 3. Anonymize user messages
    UPDATE "ConversationMessage"
    SET "actorId" = NULL, "content" = '[deleted]'
    WHERE "actorId" = user_id_param;

    -- 4. Anonymize the profile row
    UPDATE "Profile"
    SET 
        "email" = 'deleted-' || user_id_param::TEXT || '@invalid',
        "preferredName" = NULL,
        "status" = 'deleted',
        "deletedAt" = NOW()
    WHERE "id" = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
