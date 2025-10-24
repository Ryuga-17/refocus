import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  type AuthUser = { id?: string };
  const userId = (session?.user as AuthUser | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;
  const db = await getDb();
  const col = db.collection("sessions");
  
  // Find the session
  const s = await col.findOne({ _id: new ObjectId(sessionId) });
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Check if user is a participant
  const participants = s.session_participants || [];
  const userParticipant = participants.find((p: any) => p.user_id === userId);
  if (!userParticipant) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  // Check if user already left
  if (userParticipant.left_at) {
    return NextResponse.json({ error: "Already left session" }, { status: 400 });
  }

  // Update the participant to mark as left
  await col.updateOne(
    { _id: new ObjectId(sessionId) },
    {
      $set: {
        "session_participants.$[elem].left_at": new Date(),
        "session_participants.$[elem].left_reason": "voluntary",
        updated_at: new Date(),
      },
    },
    {
      arrayFilters: [{ "elem.user_id": userId }],
    }
  );

  return NextResponse.json({ ok: true });
}
