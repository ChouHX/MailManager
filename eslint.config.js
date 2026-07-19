import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: ["dist", "src-tauri/target"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
)
