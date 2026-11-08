import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-lg text-muted-foreground">This page doesn’t exist or isn’t available to you. · यह पेज उपलब्ध नहीं है।</p>
      <Link href="/" className="mt-8 text-base text-primary underline underline-offset-4">
        Go home · होम
      </Link>
    </div>
  );
}
