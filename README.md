# AWS TUI (EC2 + S3)

A terminal UI built with Ink for quickly browsing AWS EC2 and S3, using your existing AWS CLI credentials/profiles.

## Features
- EC2 instance list with paging, keyboard shortcuts, detail view, and start/stop controls.
- S3 bucket/object browser with hierarchical navigation, folder drilling, and object detail + download (local path autocomplete).
- Region picker, profile/region env overrides; EC2 has start/stop, S3 remains view/download only.

## Install
```bash
npm install
npm run build
# optional global + man page
npm run install:global
```

## Run
```bash
npm run dev    # live reload
npm start      # run built binary (after build)
```

## Key bindings
- Global: `q` to quit, `R` to open region modal.
- EC2:
  - arrows/jk move, PgDn/PgUp paginate, enter opens detail, Esc/← back
  - `s` starts a stopped instance, `x` stops a running instance, `r` refreshes
- S3:
  - Bucket list: arrows to select, enter/→ opens bucket, Esc back.
  - In bucket: arrows move, enter/→ on folder drills in, enter on file opens detail, ←/backspace goes up, PgDn/PgUp paginate, r refresh.
  - S3 detail: Tab accepts first path suggestion, enter downloads, Esc/← closes detail.

## Tests
```bash
npm test
```

## Notes
- Downloads default to `~/Downloads/<bucket>/<key>`; uses your AWS credentials chain.
- EC2 start/stop uses your AWS credentials; state may take time to reflect. S3 remains read-only (browse + download).
