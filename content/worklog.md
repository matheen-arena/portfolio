# Work Log

<!-- Edit this file to update the Work log section. See content/USAGE.md for the format. -->
<!-- Roles and projects appear on the site in the same order as in this file. -->

## Cloud and Platform Engineer | zeb
- when: May 2026 – Present
- where: Chennai, India
- badge: current

### Grafana OTEL
- domain: Retail
- stack: AWS, Amazon EKS, Grafana OSS, Grafana Alloy, Grafana Loki, Grafana Mimir, Grafana Alloy Proxy, Terraform

- [OBSERVABILITY] Designed and deployed a centralized **OpenTelemetry observability architecture** using **Grafana Alloy**, deploying Alloy Edge instances across existing AWS EKS clusters and an Alloy Proxy in a centralized AWS observability account to consolidate log ingestion from multiple AWS accounts.
- [GRAFANA] Deployed and configured **Grafana Loki** for centralized log storage and querying, and **Grafana Mimir** for scalable metrics storage and querying.
- [COLLABORATION] Collaborated with engineering teams on Grafana and OpenTelemetry adoption, providing technical guidance and mentoring on observability architecture, configuration, and operational best practices.

### AWS Enterprise Cloud Modernization
- domain: Finance
- stack: AWS, AWS Control Tower, AWS Organizations, AWS Config, AWS IAM Identity Center (SSO), Service Control Policies (SCPs), Amazon ECS, Amazon Aurora, Amazon ElastiCache for Redis, AWS Lambda, Amazon EFS, AWS WAF, Amazon CloudFront, AWS DataSync, Terraform

- [WAFR] Conducted a **Well-Architected Framework Review (WAFR)** to assess the existing AWS environment, identify infrastructure and governance gaps, and define remediation requirements in collaboration with business stakeholders.
- [SECURITY] Established **AWS Control Tower** from the ground up, implementing multi-account governance using AWS Config and Service Control Policies (SCPs), and configured **AWS IAM Identity Center (SSO)** with least-privilege access for **15 teams** through role-based permission sets.
- [AWS] Migrated the sandbox environment from the legacy AWS account to a newly established account, separating Production and Non-Production environments and provisioning the required infrastructure, including ECS, Aurora, ElastiCache for Redis, Lambda, EFS, AWS WAF, and CloudFront, via **modular Terraform**.
- [AWS NETWORKING] Designed the **AWS network architecture** from the ground up, including VPCs, subnets, route tables, Network ACLs, security groups, and VPC endpoints, and established secure VPC peering across AWS accounts and with **MongoDB Atlas**.
- [DATA] Migrated **70 TB of EFS data** from the legacy account to the new AWS account using **AWS DataSync** Enhanced mode with an agent-based approach.
- [SCM] Migrated **30 AWS CodeCommit repositories** to GitHub using automated migration workflows and migrated **10 Jenkins jobs** to GitHub Actions, improving source control and CI/CD standardization.
- [COLLABORATION] Led the engineering activities for the **sandbox cutover**, coordinating infrastructure migration and validation to minimize the risk of disruption to Production workloads running in the legacy AWS account.

### University Athletics Cloud Platform
- domain: Education
- stack: AWS, ECS, Aurora, CDN, AWS Control Tower, DevSecOps, Blue/Green Deployment, API Gateway, Terraform

- [ENGINEERING] Designed and implemented a production-ready **cloud-native AWS platform** from the ground up for a university athletics product, modernizing a local environment hosting MySQL databases and two applications: **Coach Dashboard** and **Athlete Portal**.
- [AWS] Architected and deployed both applications on **Amazon ECS** using **Blue/Green deployments**, along with Aurora, Lambda, and a CDN via **modular Terraform**, enabling controlled releases, reduced deployment risk, and production-ready application delivery.
- [AWS NETWORKING] Designed and implemented the **AWS network architecture** from the ground up, including VPCs, subnets, route tables, Network ACLs, security groups, and VPC endpoints.
- [ENGINEERING] Designed and implemented a lightweight, efficient Athlete Portal architecture supporting **1,500+ athletes**, providing athlete-specific data with role-based access and eliminating the need for a complex backend service.
- [ENGINEERING] Designed the Athlete Portal data-access architecture using **CDN-based delivery** and **API Gateway** endpoints backed by **Amazon Aurora**, optimizing data retrieval and application performance.
- [SECURITY] Established the complete **AWS Control Tower** foundation and cloud governance setup using AWS Config and SCPs, creating the baseline AWS environment required for secure and scalable application hosting.
- [DEVSECOPS] Designed and implemented the organization's **SCM and DevSecOps** practices from the ground up, establishing source-control standards, branching strategies, CI/CD practices, deployment workflows, and engineering best practices.
- [DEPLOY] Built the platform with a **production-first cloud architecture**, covering application hosting, database integration, deployment automation, cloud governance, and software delivery practices from development through production.

### ETL Data Portal
- domain: Retail
- stack: AWS, Amazon EKS, Argo Cron Workflows, ETL, CI/CD, Container, Docker, DevSecOps, Terraform

- [ARGO] Architected and deployed **Argo Cron Workflows on Amazon EKS** to eliminate always-on EC2 instances, enabling on-demand compute for the data engineering team to run Argo Cron ETL jobs and reducing infrastructure costs.
- [ENGINEERING] Engineered a cost-optimized AWS architecture to reduce **AWS data transfer costs** by keeping traffic from AWS to **Salesforce** within the AWS network, while maintaining customer data security and compliance requirements.
- [COLLABORATION] Collaborated with data engineers and stakeholders to gather requirements and design Argo Cron Workflows for scheduled and automated ETL processing.
- [CI/CD & DEVSECOPS] Implemented **GitHub Actions** workflows to securely build and publish Docker images to **Amazon ECR** with DevSecOps practices and to automate Argo Cron Workflow deployments, eliminating manual deployment steps and reducing click-ops.

## Cloud and DevOps Engineer | Avasoft
- when: May 2025 – April 2026
- where: Chennai, India

### Logz to Grafana OSS Migration
- domain: Retail
- stack: AWS, Amazon EKS, Grafana OSS, AWS Elasticsearch, Amazon Kinesis, Logz.io, Kiro AI, GitSync, Terraform

- [OBSERVABILITY & COST] Designed and deployed a self-hosted open-source **Grafana observability platform on Amazon EKS**, reducing observability costs by approximately **$250K annually** by migrating from Logz.io.
- [ENGINEERING] Centralized log ingestion for **1,200+ AWS Lambda functions** and **50+ AWS Batch and Amazon ECS workloads** using Amazon Kinesis, routing logs from Logz.io to Grafana OSS.
- [AI AGENTS] Developed a custom **Kiro AI agent** that automated the migration of 150+ dashboards and 300+ alerts from Logz.io to self-hosted Grafana, significantly reducing manual migration effort.
- [GITOPS] Implemented a GitOps-based **GitSync** to manage version-controlled production Grafana dashboards in a centralized Git repository for multiple domain services.

### GitLab to GitHub Migration
- domain: Retail
- stack: GitLab, GitHub, GitHub Actions, Terraform, AWS, Amazon EKS, GitHub ARC, DevSecOps, CI/CD, ServiceNow

- [SCM] Migrated **2,100+ projects** from GitLab to GitHub and established standardized multi-environment deployment workflows across Development, QA, UAT, and Production, with approval gates and code quality controls.
- [CI/CD & DEVSECOPS] Built centralized **GitHub Actions** pipelines integrating AWS and **ServiceNow**, embedding security and quality checks, automated deployment controls, and environment-specific release automation to streamline software delivery.
- [AWS] Deployed and managed self-hosted **GitHub Actions Runner Controller (ARC)** on EKS with event-driven autoscaling, efficiently handling peak build workloads, reducing job wait times, and ensuring reliable CI/CD execution across multiple development teams.
- [COST] Reduced CI/CD runner costs by **80%** by shifting from GitLab EC2 runners to self-hosted GitHub ARC runners on Amazon EKS.

## Python Developer – Intern | Stellar Innovations
- when: August 2024 – November 2024
- where: Bangalore, India
- badge: intern

### ETL pipeline development
- domain: Healthcare
- stack: Python, AWS S3, AWS EC2, MySQL, Linux

- [ETL] Engineered ETL pipelines to extract data from open-source databases and upload it to **AWS S3**.
- [AWS] Orchestrated data processing tasks on **AWS EC2** using Python scripts in a Linux environment.
- [DATA] Integrated and cleaned data from multiple sources in **MySQL** databases to ensure high data quality.
- [COLLABORATION] Collaborated with back-end developers and other stakeholders to provide essential database support.
