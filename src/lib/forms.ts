/**
 * The submitted form, or `null` when the body isn't form data (e.g. a JSON POST, which Astro's origin check lets
 * through). Endpoints redirect on `null` instead of letting `request.formData()` throw into a 500.
 */
export async function readForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
