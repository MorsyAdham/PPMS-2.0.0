# F200 Battalion Planning Structure for K9, K10, and K11

## Purpose

This document defines the planning structure required to build a battalion delivery plan for the F200 program covering:

- K9
- K10
- K11

The objective is to determine:

- Based on the battalion deadline, when must each vehicle start production?

---

## Standard Process Flow

The planning sequence shall follow this process flow:

1. Cutting
2. Part machining
3. Sub weldment
4. Main weldment
5. Structure machining (Ingersoll)
6. Assembly (Cables, Accessories, and Structure)

Each step is assumed to start only after the previous step is completed unless a different rule is later confirmed and formally added.

---

## Main Planning Assumptions

### 1. Sequential production logic

The default planning rule is sequential flow:

- A step starts after the previous step ends.
- The next operation can automatically start immediately once the previous one is finished.

### 2. Lead time definition

For each process step, the required input is the actual lead time to produce one vehicle at that step.

This lead time should reflect real production capability, not only theoretical machine or labor time.

### 3. Parallel work inside a step

If a process contains multiple stations working in parallel, the planning logic should reflect the actual production constraint.

Example for K9 Assembly:

- Total stations: 11
- Turret stations: 4
- Hull stations: 7
- Turret and Hull work in parallel
- Effective planning path is based on 7 stations
- Each station takes 2 days
- Therefore, total Assembly lead time for one K9 vehicle = 14 days

This means that internal parallel activity can exist inside a process, but the process itself is still treated as one step in the overall sequence.

### 4. Vehicle-specific values

K9, K10, and K11 may have different lead times at the same process step.

Therefore, lead times must be collected separately for each vehicle type.

---

## Required Inputs

To complete the battalion plan, the following data must be confirmed for each vehicle type:

- Battalion required quantity
- Required delivery deadline
- Lead time for Cutting
- Lead time for Part machining
- Lead time for Sub weldment
- Lead time for Main weldment
- Lead time for Structure machining (Ingersoll)
- Lead time for Assembly
- Any confirmed capacity limitations or special constraints

---

## Planning Template by Vehicle

### K9

| Process Step | Lead Time for One Vehicle | Notes |
|---|---:|---|
| Cutting | ____ | |
| Part machining | ____ | |
| Sub weldment | ____ | |
| Main weldment | ____ | |
| Structure machining (Ingersoll) | ____ | |
| Assembly (Cables, Accessories, and Structure) | ____ | Example reference: 14 days if using 7 effective stations x 2 days |
| **Total Lead Time** | ____ | Sum of all above steps |

Additional planning inputs for K9:

- Battalion quantity: ____
- Delivery deadline: ____
- Production start date required: ____

### K10

| Process Step | Lead Time for One Vehicle | Notes |
|---|---:|---|
| Cutting | ____ | |
| Part machining | ____ | |
| Sub weldment | ____ | |
| Main weldment | ____ | |
| Structure machining (Ingersoll) | ____ | |
| Assembly (Cables, Accessories, and Structure) | ____ | |
| **Total Lead Time** | ____ | Sum of all above steps |

Additional planning inputs for K10:

- Battalion quantity: ____
- Delivery deadline: ____
- Production start date required: ____

### K11

| Process Step | Lead Time for One Vehicle | Notes |
|---|---:|---|
| Cutting | ____ | |
| Part machining | ____ | |
| Sub weldment | ____ | |
| Main weldment | ____ | |
| Structure machining (Ingersoll) | ____ | |
| Assembly (Cables, Accessories, and Structure) | ____ | |
| **Total Lead Time** | ____ | Sum of all above steps |

Additional planning inputs for K11:

- Battalion quantity: ____
- Delivery deadline: ____
- Production start date required: ____

---

## Suggested Calculation Logic

Once the missing lead times are confirmed, the planning method should be:

1. Define the battalion delivery deadline.
2. Confirm the required quantity for K9, K10, and K11.
3. Confirm the actual lead time for each process step for one vehicle.
4. Sum the process lead times to calculate total lead time per vehicle.
5. Count backward from the deadline to determine the required production start date.
6. Review whether any capacity constraints change the calculated plan.

---

## Open Items to Be Filled Later

The following values still need confirmation:

- Lead time for Cutting for K9, K10, and K11
- Lead time for Part machining for K9, K10, and K11
- Lead time for Sub weldment for K9, K10, and K11
- Lead time for Main weldment for K9, K10, and K11
- Lead time for Structure machining (Ingersoll) for K9, K10, and K11
- Lead time for Assembly for K10 and K11
- Confirmation of the final Assembly logic for K9
- Battalion quantities
- Final required delivery deadline

---

## Expected Final Output

After the missing inputs are completed, this plan should provide:

- A clear production route for K9, K10, and K11
- A confirmed lead time per process step
- A total lead time per vehicle
- A required production start date based on the battalion deadline
- A planning basis that can be used for scheduling and execution follow-up
