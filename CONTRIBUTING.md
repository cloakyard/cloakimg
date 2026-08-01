# Contributing to CloakIMG

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Install** dependencies (`vp install`)
4. **Commit** your changes (`git commit -m 'Add amazing feature'`)
5. **Push** to the branch (`git push origin feature/amazing-feature`)
6. **Open** a Pull Request

## Validation

Run the shared quality checks before opening a pull request:

```bash
vp check
vp test
vp build
```

Changes to editor controls, tool panels, dialogs, or responsive layout must also run:

```bash
vp run test:tools
vp run test:visual
vp run test:audit
```

UI changes must follow [DESIGN.md](DESIGN.md). Preserve compact desktop density,
visible keyboard focus, semantic control state, and 44px touch targets on coarse
pointers. The responsive audit covers desktop, tablet, phone, compact phone, and
narrow Android layouts using the checked-in fixtures.
