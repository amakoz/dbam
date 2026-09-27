// Polish is the default locale and the source of truth for message keys: `en.ts` must define every key below.
// Plural messages use `_one`/`_few`/`_many`/`_other` suffixes and are read with `t.plural(baseKey, count)`.
export const pl = {
  "meta.title": "10x Astro Starter",

  "language.switcher": "Język",
  "language.pl": "Polski",
  "language.en": "English",

  "config.warning": "Uwaga:",
  "config.docs": "Dokumentacja",
  "config.supabase.missing": "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
  "config.supabase.docsLabel": "Zobacz instrukcję konfiguracji",

  "nav.dashboard": "Panel",
  "nav.signin": "Zaloguj się",
  "nav.signup": "Zarejestruj się",
  "nav.signout": "Wyloguj się",
  "nav.notSignedIn": "Nie zalogowano",

  "home.title": "10x Astro Starter",
  "home.subtitle":
    "Gotowy do produkcji starter z uwierzytelnianiem, nowoczesnymi narzędziami i kosmicznym komfortem pracy programisty.",
  "home.features.auth.title": "Gotowe uwierzytelnianie",
  "home.features.auth.description":
    "Wbudowane uwierzytelnianie Supabase: logowanie, rejestracja i chronione trasy od razu po instalacji.",
  "home.features.stack.title": "Nowoczesny stos technologiczny",
  "home.features.stack.description":
    "Astro 7, React 19, Tailwind 4 i TypeScript — najnowsze narzędzia, gotowe do pracy.",
  "home.features.dx.title": "Wygoda pracy programisty",
  "home.features.dx.description": "ESLint, Prettier i hooki pre-commit dbają o porządek w kodzie od pierwszego dnia.",

  "dashboard.title": "Panel",
  "dashboard.greeting": "Witaj,",
  "dashboard.description": "Ta strona jest dostępna tylko dla zalogowanych użytkowników.",

  "auth.signin.title": "Zaloguj się",
  "auth.signin.submit": "Zaloguj się",
  "auth.signin.pending": "Logowanie…",
  "auth.signin.confirmed": "Twój adres e-mail został potwierdzony. Zaloguj się, aby kontynuować.",
  "auth.signin.noAccount": "Nie masz konta?",
  "auth.signin.signupLink": "Zarejestruj się",

  "auth.signup.title": "Zarejestruj się",
  "auth.signup.submit": "Utwórz konto",
  "auth.signup.pending": "Tworzenie konta…",
  "auth.signup.hasAccount": "Masz już konto?",
  "auth.signup.signinLink": "Zaloguj się",

  "auth.confirm.success.title": "Rejestracja zakończona",
  "auth.confirm.success.description": "Twoje konto zostało utworzone. Możesz się teraz zalogować.",
  "auth.confirm.success.link": "Przejdź do logowania",
  "auth.confirm.pending.title": "Sprawdź skrzynkę e-mail",
  "auth.confirm.pending.description":
    "Wysłaliśmy link potwierdzający na Twój adres e-mail. Kliknij go, aby aktywować konto.",
  "auth.confirm.pending.link": "Wróć do logowania",

  "auth.form.email": "E-mail",
  "auth.form.emailPlaceholder": "jan@example.com",
  "auth.form.emailRequired": "Adres e-mail jest wymagany",
  "auth.form.emailInvalid": "Podaj poprawny adres e-mail",
  "auth.form.password": "Hasło",
  "auth.form.passwordPlaceholder": "Twoje hasło",
  "auth.form.passwordRequired": "Hasło jest wymagane",
  "auth.form.passwordMinPlaceholder_one": "Min. {count} znak",
  "auth.form.passwordMinPlaceholder_few": "Min. {count} znaki",
  "auth.form.passwordMinPlaceholder_many": "Min. {count} znaków",
  "auth.form.passwordMinPlaceholder_other": "Min. {count} znaku",
  "auth.form.passwordTooShort_one": "Hasło musi mieć co najmniej {count} znak",
  "auth.form.passwordTooShort_few": "Hasło musi mieć co najmniej {count} znaki",
  "auth.form.passwordTooShort_many": "Hasło musi mieć co najmniej {count} znaków",
  "auth.form.passwordTooShort_other": "Hasło musi mieć co najmniej {count} znaku",
  "auth.form.passwordRemaining_one": "Wpisz jeszcze {count} znak",
  "auth.form.passwordRemaining_few": "Wpisz jeszcze {count} znaki",
  "auth.form.passwordRemaining_many": "Wpisz jeszcze {count} znaków",
  "auth.form.passwordRemaining_other": "Wpisz jeszcze {count} znaku",
  "auth.form.confirmPassword": "Powtórz hasło",
  "auth.form.confirmPasswordPlaceholder": "Wpisz hasło ponownie",
  "auth.form.confirmPasswordRequired": "Potwierdź hasło",
  "auth.form.passwordMismatch": "Hasła nie są identyczne",
  "auth.form.showPassword": "Pokaż hasło",
  "auth.form.hidePassword": "Ukryj hasło",

  "errors.auth.unknown": "Coś poszło nie tak. Spróbuj ponownie.",
  "errors.auth.not_configured": "Logowanie jest chwilowo niedostępne: brak konfiguracji Supabase.",
  "errors.auth.missing_code": "Link potwierdzający jest niekompletny. Otwórz go ponownie z wiadomości e-mail.",
  "errors.auth.link_invalid": "Link potwierdzający jest nieprawidłowy lub wygasł. Spróbuj się zalogować.",
  "errors.auth.invalid_credentials": "Nieprawidłowy adres e-mail lub hasło.",
  "errors.auth.email_not_confirmed":
    "Adres e-mail nie został jeszcze potwierdzony. Kliknij link w wiadomości, którą wysłaliśmy.",
  "errors.auth.user_already_exists": "Konto z tym adresem e-mail już istnieje. Zaloguj się.",
  "errors.auth.weak_password": "Hasło jest zbyt słabe. Wybierz dłuższe lub trudniejsze do odgadnięcia.",
  "errors.auth.over_email_send_rate_limit": "Wysłaliśmy zbyt wiele wiadomości. Odczekaj chwilę i spróbuj ponownie.",
  "errors.auth.over_request_rate_limit": "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.",
  "errors.auth.validation_failed": "Sprawdź, czy adres e-mail i hasło są poprawne.",
} satisfies Record<string, string>;
