# QueueCraft documentation screenshots

PNG screenshots at 1440 × 900, light theme, captured from a separate, disposable demo database.

All names, emails, projects and activity in these screenshots are fictional. Emails use the reserved `.invalid` domain. No production or development business records are used.

`18-settings.png` is a labeled composite of real Notifications and Backup & restore views, because these controls are on separate tabs. Every other PNG is a single application viewport.

The demonstration Service Head is also the local recovery administrator so that every Settings and backup control can be documented. The normal member does not have those permissions. This does not change real application permissions.

The repeatable fixture is `artifacts/api-server/scripts/seed-documentation.ts`. It refuses production, non-local databases, any database other than `queuecraft_documentation`, and databases with existing members. Demo login credentials are generated per run and are not included here.

## Additional views

The following screenshots document the dedicated Pipeline page and direct My Work actions. They also use fictional, disposable demonstration data.

- `20-pipeline.png`: waiting proposals with the default Pipeline status filter.
- `21-topics-delivery.png`: delivery topics, excluding Pending validation, Pipeline and Not pursued.
- `22-my-work-running.png`: current-day assignments including a Not Started milestone.
- `23-my-work-milestone-status.png`: milestone status control in My Work.
- `24-my-work-topic-status.png`: topic status control in My Work.
- `25-pipeline-detail.png`: proposal metadata and existing lifecycle actions.
- `26-pipeline-create.png`: fictional proposal form with Pipeline selected.
- `27-pipeline-not-pursued.png`: declined proposal and recorded reason.
- `28-pipeline-status-filter.png`: Pipeline / Not pursued filter options.

`03-my-work.png` and `04-topics-list.png` were refreshed to reflect the updated interface. New captures include fictional proposal records in addition to the original demo fixture.
